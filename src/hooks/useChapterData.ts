import { useState, useEffect, useMemo, useRef } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { dbService, type Novel, type Chapter } from '../services/db.service';
import { scraperService, type ScraperProgress } from '../services/scraper.service';
import { chapterListCache } from '../services/chapterListCache';

export type FilterType = 'all' | 'read' | 'unread' | 'downloaded';
export type SortOrder = 'asc' | 'desc';

/**
 * One in-flight load per novel across all hook instances. Library syncs intentionally
 * outlive the screen (so chapters keep persisting), but when the same novel is opened
 * again the old sync is cancelled and the new one resumes from the DB count, instead of
 * two syncs writing the same rows concurrently.
 */
const inFlightLoads = new Map<string, AbortController>();
const loadKey = (id: string) => id.replace(/\/$/, '').replace(/\/chapters$/i, '').toLowerCase();

export function useChapterData() {
    const { novelId } = useParams<{ novelId: string }>();
    const location = useLocation();

    // Core Data
    const [novel, setNovel] = useState<Novel | null>(null);
    const [chapters, setChapters] = useState<Chapter[]>([]);
    const [liveChapters, setLiveChapters] = useState<{ title: string; url: string; _index: number; date?: string }[]>([]);

    // UI State
    const [loading, setLoading] = useState(true);
    const [loadingPage, setLoadingPage] = useState(0);
    const [isPreviewMode, setIsPreviewMode] = useState(false);
    const [addedToLibrary, setAddedToLibrary] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);

    // Filtering & Sorting
    const [filter, setFilter] = useState<FilterType>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

    // Live Mode Tracking
    const isLiveMode = !!location.state?.liveMode || !!novelId?.startsWith('live-');
    const [downloadedLiveChapters, setDownloadedLiveChapters] = useState<Set<string>>(new Set());
    const [readLiveChapters, setReadLiveChapters] = useState<Set<string>>(new Set());

    // Scraper Status
    const [scrapingProgress, setScrapingProgress] = useState<ScraperProgress>(scraperService.progress);
    const [isGlobalScraping, setIsGlobalScraping] = useState(scraperService.isScraping);

    // Active lifecycle refs
    const isMountedRef = useRef(true);
    const activeLoadRef = useRef<AbortController | null>(null);
    const addedToLibraryRef = useRef(false);
    addedToLibraryRef.current = addedToLibrary;
    const dbNovelRef = useRef<Novel | null>(null);

    const loadData = async (externalSignal?: AbortSignal) => {
        if (!novelId) return;

        const key = loadKey(novelId);
        inFlightLoads.get(key)?.abort();
        const controller = new AbortController();
        activeLoadRef.current = controller;
        inFlightLoads.set(key, controller);
        if (isMountedRef.current) setLoadError(null);

        if (externalSignal) {
            if (externalSignal.aborted) controller.abort();
            else externalSignal.addEventListener('abort', () => {
                if (!addedToLibraryRef.current && !dbNovelRef.current) {
                    controller.abort();
                }
            }, { once: true });
        }

        const signal = controller.signal;
        let knownChapters: Chapter[] = [];
        let accumulatedLive: { title: string; url: string; _index: number; date?: string }[] = [];

        try {
            // Check cache for instant rendering
            const cached = chapterListCache.get(novelId);
            if (cached) {
                if (cached.novel && isMountedRef.current) setNovel(cached.novel);
                if (cached.chapters?.length > 0 && isMountedRef.current) setChapters(cached.chapters);
                if (cached.liveChapters?.length > 0) {
                    accumulatedLive = [...cached.liveChapters];
                    if (isMountedRef.current) setLiveChapters(accumulatedLive);
                }
                knownChapters = cached.chapters || [];
                // Only mark loading as complete if chapters were actually in the cache
                if ((cached.chapters?.length > 0 || cached.liveChapters?.length > 0) && isMountedRef.current) {
                    setLoading(false);
                }
            } else {
                if (isMountedRef.current) setLoading(true);
            }

            await dbService.initialize();

            // 1. Load from DB
            const dbNovel = await dbService.getNovel(novelId);
            dbNovelRef.current = dbNovel;
            let currentNovel = dbNovel;
            let dbChaptersCount = 0;

            if (dbNovel) {
                if (isMountedRef.current) {
                    setNovel(dbNovel);
                    setAddedToLibrary(true);
                    setIsPreviewMode(false);
                }
                addedToLibraryRef.current = true;

                const targetNovelId = dbNovel.id || novelId;
                const dbChapters = await dbService.getChapters(targetNovelId);

                if (isMountedRef.current) {
                    setChapters(dbChapters);
                    if (dbChapters.length > 0) {
                        setLoading(false);
                    }
                }

                // Duplicate cleanup is maintenance: never block or fail the visible list on it.
                dbService.repairDuplicateChapters(targetNovelId)
                    .then(async repaired => {
                        if (!repaired || signal.aborted) return;
                        const fresh = await dbService.getChapters(targetNovelId);
                        if (isMountedRef.current && !signal.aborted) setChapters(fresh);
                    })
                    .catch(err => console.warn('[useChapterData] Background repair failed', err));
                knownChapters = dbChapters;
                dbChaptersCount = dbChapters.length;

                // Map DB state to Live trackers
                const savedUrls = new Set(
                    dbChapters
                        .filter(c => c.content || c.contentPath)
                        .map(c => c.audioPath)
                        .filter(Boolean) as string[]
                );
                // Only include chapters with explicit isRead=1 — no bulk index inference
                const readUrls = new Set(
                    dbChapters
                        .filter(c => c.isRead)
                        .flatMap(c => [c.audioPath, c.id])
                        .filter(Boolean) as string[]
                );

                if (dbNovel.lastReadChapterId) {
                    readUrls.add(dbNovel.lastReadChapterId);
                }

                if (isMountedRef.current) {
                    setDownloadedLiveChapters(savedUrls);
                    setReadLiveChapters(readUrls);
                }

                // Populate liveChapters from DB
                if (dbChapters.length > 0) {
                    const indexedChapters = dbChapters.map(ch => ({
                        title: ch.title,
                        url: ch.audioPath || '',
                        _index: ch.orderIndex,
                        date: ch.date
                    }));
                    accumulatedLive = indexedChapters;
                    if (isMountedRef.current) setLiveChapters(indexedChapters);
                }

                // Hydrate reading progress
                if (!dbNovel.lastReadChapterId && typeof localStorage !== 'undefined') {
                    const cleanId = novelId.replace(/\/$/, '').replace(/\/chapters$/i, '');
                    const savedLastRead = localStorage.getItem(`lastRead:${novelId}`) ||
                        localStorage.getItem(`lastRead:${cleanId}`) ||
                        (dbNovel.sourceUrl ? localStorage.getItem(`lastRead:${dbNovel.sourceUrl.replace(/\/$/, '').replace(/\/chapters$/i, '')}`) : null);
                    const savedLastReadAt = localStorage.getItem(`lastReadAt:${novelId}`) || (dbNovel.sourceUrl ? localStorage.getItem(`lastReadAt:${dbNovel.sourceUrl}`) : null);
                    if (savedLastRead) {
                        dbNovel.lastReadChapterId = savedLastRead;
                        dbNovel.lastReadAt = savedLastReadAt ? parseInt(savedLastReadAt, 10) : Date.now();
                    }
                }

                if (!dbNovel.sourceUrl && location.state?.novel?.sourceUrl) {
                    dbNovel.sourceUrl = location.state.novel.sourceUrl;
                }
            } else if (location.state?.novel) {
                // Preview Mode
                currentNovel = {
                    ...location.state.novel,
                    id: novelId,
                    summary: location.state.novel.summary || ''
                } as Novel;

                if (typeof localStorage !== 'undefined') {
                    const cleanId = novelId.replace(/\/$/, '').replace(/\/chapters$/i, '');
                    const savedLastRead = localStorage.getItem(`lastRead:${novelId}`) ||
                        localStorage.getItem(`lastRead:${cleanId}`) ||
                        (currentNovel.sourceUrl ? localStorage.getItem(`lastRead:${currentNovel.sourceUrl.replace(/\/$/, '').replace(/\/chapters$/i, '')}`) : null);
                    const savedLastReadAt = localStorage.getItem(`lastReadAt:${novelId}`) || (currentNovel.sourceUrl ? localStorage.getItem(`lastReadAt:${currentNovel.sourceUrl}`) : null);
                    if (savedLastRead) {
                        currentNovel.lastReadChapterId = savedLastRead;
                        currentNovel.lastReadAt = savedLastReadAt ? parseInt(savedLastReadAt, 10) : Date.now();
                        if (isMountedRef.current) setReadLiveChapters(prev => new Set(prev).add(savedLastRead));
                    }
                }

                if (isMountedRef.current) {
                    setNovel(currentNovel);
                    setIsPreviewMode(true);
                    setAddedToLibrary(false);
                    if (!navigator.onLine) {
                        setLoading(false);
                    }
                }
            }

            // 2. Smart Caching and Resumption
            const sourceUrl = currentNovel?.sourceUrl || location.state?.novel?.sourceUrl;
            const now = Math.floor(Date.now() / 1000);
            const lastFetched = currentNovel?.lastFetchedAt || 0;
            const isFresh = (now - lastFetched) < 21600; // 6 hours

            const totalCount = currentNovel?.totalChapters || 0;
            const cachedLiveCount = (!dbNovel && cached?.liveChapters) ? cached.liveChapters.length : 0;
            const effectiveKnownCount = Math.max(dbChaptersCount, cachedLiveCount, accumulatedLive.length);

            // Complete check
            const isCacheComplete = totalCount > 100 ? (effectiveKnownCount >= totalCount * 0.95) : false;
            const isDbMetadataComplete = dbNovel?.author && dbNovel.author !== 'Unknown' && !!dbNovel.summary;
            const shouldSkipFetch = (dbNovel && isFresh && dbChaptersCount > 0 && isCacheComplete && isDbMetadataComplete) ||
                (!dbNovel && cached && isCacheComplete && cached.novel?.author && cached.novel.author !== 'Unknown');

            if (sourceUrl && navigator.onLine && !shouldSkipFetch) {
                try {
                    const data = await scraperService.fetchNovelFast(
                        sourceUrl,
                        async (chaptersFound, page, metadata) => {
                            if (isMountedRef.current) setLoadingPage(page);

                            if (chaptersFound.length > 0) {
                                // Deduplicate against all existing URLs
                                const existingUrls = new Set(accumulatedLive.map(ch => ch.url).filter(Boolean));
                                const newChapters = chaptersFound.filter(ch => !existingUrls.has(ch.url));

                                if (newChapters.length > 0) {
                                    const baseIndex = accumulatedLive.length;
                                    const indexedChapters = newChapters.map((ch, idx) => ({
                                        title: ch.title,
                                        url: ch.url,
                                        _index: baseIndex + idx,
                                        date: ch.date
                                    }));

                                    accumulatedLive = [...accumulatedLive, ...indexedChapters];
                                    if (isMountedRef.current) {
                                        setLiveChapters(accumulatedLive);
                                        setLoading(false);
                                    }

                                    // If novel is in library (either from DB or user tapped Add to Library)
                                    // Save every batch of chapters to SQLite immediately!
                                    const isInLibrary = addedToLibraryRef.current || dbNovelRef.current !== null;
                                    const targetDbId = dbNovelRef.current?.id || currentNovel?.id || novelId;

                                    if (isInLibrary && targetDbId) {
                                        const incrementalDbChapters: Chapter[] = indexedChapters.map(ch => ({
                                            id: `${targetDbId}-ch-${ch._index}`,
                                            novelId: targetDbId,
                                            title: ch.title,
                                            orderIndex: ch._index,
                                            audioPath: ch.url,
                                            date: ch.date
                                        }));

                                        await dbService.addChapters(incrementalDbChapters);
                                        if (isMountedRef.current) {
                                            setChapters(prev => [...prev, ...incrementalDbChapters]);
                                        }
                                    }

                                    // Keep persistent cache updated with progress
                                    chapterListCache.set(novelId, {
                                        novel: currentNovel,
                                        chapters: knownChapters,
                                        liveChapters: accumulatedLive
                                    });
                                }
                            }

                            // Early Metadata Update
                            if (metadata && currentNovel) {
                                const updatedNovel = {
                                    ...currentNovel,
                                    ...metadata,
                                    coverUrl: metadata.coverUrl || currentNovel.coverUrl,
                                    summary: metadata.summary || currentNovel.summary,
                                    title: (metadata.title && metadata.title !== 'Unknown Title' && metadata.title !== 'Unknown') ? metadata.title : currentNovel.title,
                                    author: (metadata.author && metadata.author !== 'Unknown') ? metadata.author : currentNovel.author,
                                    status: (metadata.status && metadata.status !== 'Unknown' && metadata.status !== 'Ongoing') ? metadata.status : (currentNovel.status || metadata.status),
                                    totalChapters: metadata.totalChapters ?? currentNovel.totalChapters
                                } as Novel;

                                if (isMountedRef.current) setNovel(updatedNovel);
                                currentNovel = updatedNovel;
                            }
                        },
                        effectiveKnownCount,
                        signal
                    );

                    if (data) {
                        const targetDbId = dbNovelRef.current?.id || (addedToLibraryRef.current ? (currentNovel?.id || novelId) : null);

                        if (targetDbId) {
                            try {
                                await dbService.addNovel({
                                    ...currentNovel,
                                    id: targetDbId,
                                    title: (data.title && data.title !== 'Unknown Title' && data.title !== 'Unknown') ? data.title : currentNovel!.title,
                                    author: (data.author && data.author !== 'Unknown') ? data.author : currentNovel!.author,
                                    coverUrl: data.coverUrl || currentNovel!.coverUrl,
                                    summary: data.summary || currentNovel!.summary,
                                    status: (data.status && data.status !== 'Unknown' && data.status !== 'Ongoing') ? data.status : (currentNovel!.status || data.status),
                                    totalChapters: data.totalChapters ?? Math.max(currentNovel?.totalChapters || 0, accumulatedLive.length),
                                    lastFetchedAt: Math.floor(Date.now() / 1000)
                                } as Novel, false);

                                const updatedDbChapters = await dbService.getChapters(targetDbId);
                                if (isMountedRef.current) {
                                    setChapters(updatedDbChapters);
                                    setNovel(prev => prev ? { ...prev, totalChapters: data.totalChapters || updatedDbChapters.length } : null);
                                }
                            } catch (error) {
                                console.error('[useChapterData] DB finalize error:', error);
                            }
                        }

                        // Final cache refresh
                        chapterListCache.set(novelId, {
                            novel: currentNovel,
                            chapters: knownChapters,
                            liveChapters: accumulatedLive
                        });

                        if (isMountedRef.current) setLoading(false);
                    }
                } catch (e) {
                    if (!signal?.aborted) console.error('[useChapterData] Live sync error:', e);
                    if (isMountedRef.current) setLoading(false);
                }
            } else {
                if (isMountedRef.current) setLoading(false);
            }
        } catch (e) {
            if (!signal?.aborted) {
                console.error('[useChapterData] Failed to load data:', e);
                if (isMountedRef.current) setLoadError('Could not load chapters.');
            }
            if (isMountedRef.current) setLoading(false);
        } finally {
            if (isMountedRef.current) setLoadingPage(0);
            if (activeLoadRef.current === controller) activeLoadRef.current = null;
            if (inFlightLoads.get(key) === controller) inFlightLoads.delete(key);
        }
    };

    useEffect(() => {
        isMountedRef.current = true;
        const extController = new AbortController();

        const unsub = scraperService.subscribe((progress: ScraperProgress, isScraping: boolean) => {
            if (isMountedRef.current) {
                setScrapingProgress(progress);
                setIsGlobalScraping(isScraping);
            }

            // Reload if scraping finished for this novel
            if (!isScraping && progress.current > 0 && progress.current === progress.total) {
                loadData(extController.signal);
            }
        });

        loadData(extController.signal);

        return () => {
            isMountedRef.current = false;
            unsub();
            // Only abort if novel is NOT in the library (preview mode only)
            if (!addedToLibraryRef.current && !dbNovelRef.current) {
                extController.abort();
            }
        };
    }, [novelId]);

    // Keep cache synchronized on state changes
    useEffect(() => {
        if (novelId && novel && (chapters.length > 0 || liveChapters.length > 0)) {
            chapterListCache.set(novelId, {
                novel,
                chapters,
                liveChapters
            });
        }
    }, [novelId, novel, chapters, liveChapters]);

    // Computed filtered chapters
    const filteredChapters = useMemo(() => {
        const isItemRead = (item: any) => {
            const url = item.url || item.audioPath;
            const id = item.id;
            const order = item._index !== undefined ? item._index : item.orderIndex;
            return Boolean(item.isRead) ||
                (url && readLiveChapters.has(url)) ||
                (id && readLiveChapters.has(id)) ||
                (url && novel?.lastReadChapterId === url) ||
                (id && novel?.lastReadChapterId === id) ||
                (order !== undefined && (novel?.lastReadChapterId === `${novel?.id}-ch-${order}` || novel?.lastReadChapterId?.endsWith(`-ch-${order}`)));
        };

        const isItemDownloaded = (item: any) => {
            const url = item.url || item.audioPath;
            const id = item.id;
            return Boolean(item.content || item.contentPath) ||
                (url && downloadedLiveChapters.has(url)) ||
                (id && downloadedLiveChapters.has(id));
        };

        const hasDbChapters = chapters.length > 0;
        const hasLiveChapters = liveChapters.length > 0;
        const source = isLiveMode
            ? (hasLiveChapters ? liveChapters : chapters)
            : (hasDbChapters ? chapters : liveChapters);

        const result = source.filter((item: any) => {
            const title = item.title || '';
            const matchesSearch = title.toLowerCase().includes(searchQuery.toLowerCase());
            if (!matchesSearch) return false;

            switch (filter) {
                case 'read': return isItemRead(item);
                case 'unread': return !isItemRead(item);
                case 'downloaded': return isItemDownloaded(item);
                default: return true;
            }
        });

        return result.sort((a: any, b: any) => {
            const indexA = a._index !== undefined ? a._index : (a.orderIndex ?? 0);
            const indexB = b._index !== undefined ? b._index : (b.orderIndex ?? 0);
            return sortOrder === 'asc' ? indexA - indexB : indexB - indexA;
        });
    }, [chapters, liveChapters, isLiveMode, filter, searchQuery, sortOrder, novel?.id, novel?.lastReadChapterId, readLiveChapters, downloadedLiveChapters]);

    return {
        novel,
        chapters,
        liveChapters,
        loading,
        loadingPage,
        isPreviewMode,
        addedToLibrary,
        setAddedToLibrary,
        loadError,
        isLiveMode,
        downloadedLiveChapters,
        setDownloadedLiveChapters,
        readLiveChapters,
        scrapingProgress,
        isGlobalScraping,
        filter,
        setFilter,
        searchQuery,
        setSearchQuery,
        sortOrder,
        setSortOrder,
        filteredChapters,
        loadData,
        setChapters
    };
}
