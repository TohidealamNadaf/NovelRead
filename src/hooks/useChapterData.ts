import { useState, useEffect, useMemo, useRef } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { dbService, type Novel, type Chapter } from '../services/db.service';
import { scraperService, type ScraperProgress } from '../services/scraper.service';
import { chapterListCache } from '../services/chapterListCache';

export type FilterType = 'all' | 'read' | 'unread' | 'downloaded';
export type SortOrder = 'asc' | 'desc';

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

        // Abort previous in-flight load if it was not a library background sync
        if (!addedToLibraryRef.current && !dbNovelRef.current) {
            activeLoadRef.current?.abort();
        }
        const controller = new AbortController();
        activeLoadRef.current = controller;

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
                if (isMountedRef.current) setLoading(false);
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

                let dbChapters = await dbService.getChapters(novelId);

                // Auto-repair duplicates if any
                const wasRepaired = await dbService.repairDuplicateChapters(novelId);
                if (wasRepaired) {
                    dbChapters = await dbService.getChapters(novelId);
                }

                if (isMountedRef.current) {
                    setChapters(dbChapters);
                    setLoading(false);
                }
                knownChapters = dbChapters;
                dbChaptersCount = dbChapters.length;

                // Map DB state to Live trackers
                const savedUrls = new Set(
                    dbChapters
                        .filter(c => c.content || c.contentPath)
                        .map(c => c.audioPath)
                        .filter(Boolean) as string[]
                );
                let lastReadIdx = -1;
                const m = dbNovel.lastReadChapterId?.match(/-ch-(\d+)$/);
                if (m) {
                    lastReadIdx = parseInt(m[1], 10);
                } else if (dbNovel.lastReadChapterId) {
                    const matchCh = dbChapters.find(c => c.id === dbNovel.lastReadChapterId || c.audioPath === dbNovel.lastReadChapterId);
                    if (matchCh && typeof matchCh.orderIndex === 'number') {
                        lastReadIdx = matchCh.orderIndex;
                    }
                }

                const readUrls = new Set(
                    dbChapters
                        .filter(c => c.isRead || (lastReadIdx >= 0 && c.orderIndex <= lastReadIdx))
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
                    setLoading(false);
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
            if (!signal?.aborted) console.error('[useChapterData] Failed to load data:', e);
            if (isMountedRef.current) setLoading(false);
        } finally {
            if (isMountedRef.current) setLoadingPage(0);
            if (activeLoadRef.current === controller) activeLoadRef.current = null;
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
        let lastReadIdx = -1;
        const lastReadMatch = novel?.lastReadChapterId?.match(/-ch-(\d+)$/);
        if (lastReadMatch) {
            lastReadIdx = parseInt(lastReadMatch[1], 10);
        } else if (novel?.lastReadChapterId) {
            if (isLiveMode) {
                lastReadIdx = liveChapters.findIndex(c => c.url === novel.lastReadChapterId);
            } else {
                lastReadIdx = chapters.findIndex(c => c.id === novel.lastReadChapterId || c.audioPath === novel.lastReadChapterId);
            }
        }

        const isItemRead = (item: any) => {
            if (isLiveMode) {
                return readLiveChapters.has(item.url) ||
                    readLiveChapters.has(item.id) ||
                    (lastReadIdx >= 0 && item._index <= lastReadIdx) ||
                    novel?.lastReadChapterId === item.url;
            } else {
                return Boolean(item.isRead) ||
                    (lastReadIdx >= 0 && item.orderIndex <= lastReadIdx) ||
                    novel?.lastReadChapterId === item.id ||
                    novel?.lastReadChapterId === item.audioPath;
            }
        };

        const isItemDownloaded = (item: any) => {
            if (isLiveMode) {
                return downloadedLiveChapters.has(item.url);
            } else {
                return Boolean(item.content || item.contentPath);
            }
        };

        const source = isLiveMode ? liveChapters : chapters;
        const result = source.filter((item: any) => {
            const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase());
            if (!matchesSearch) return false;

            switch (filter) {
                case 'read': return isItemRead(item);
                case 'unread': return !isItemRead(item);
                case 'downloaded': return isItemDownloaded(item);
                default: return true;
            }
        });

        return result.sort((a: any, b: any) => {
            const indexA = isLiveMode ? a._index : a.orderIndex;
            const indexB = isLiveMode ? b._index : b.orderIndex;
            return sortOrder === 'asc' ? indexA - indexB : indexB - indexA;
        });
    }, [chapters, liveChapters, isLiveMode, filter, searchQuery, sortOrder, novel?.lastReadChapterId, readLiveChapters, downloadedLiveChapters]);

    return {
        novel,
        chapters,
        liveChapters,
        loading,
        loadingPage,
        isPreviewMode,
        addedToLibrary,
        setAddedToLibrary,
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
