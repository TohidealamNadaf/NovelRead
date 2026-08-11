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

    const activeLoadRef = useRef<AbortController | null>(null);

    const loadData = async (externalSignal?: AbortSignal) => {
        if (!novelId) return;

        // Abort any previous in-flight load, then create a FRESH controller
        activeLoadRef.current?.abort();
        const controller = new AbortController();
        activeLoadRef.current = controller;

        if (externalSignal) {
            if (externalSignal.aborted) controller.abort();
            else externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
        }

        const signal = controller.signal;

        let knownChapters: Chapter[] = [];

        try {
            const cached = chapterListCache.get(novelId);
            if (cached) {
                setNovel(cached.novel);
                setChapters(cached.chapters);
                setLiveChapters(cached.liveChapters);
                knownChapters = cached.chapters;
                setLoading(false);
            } else {
                setLoading(true);
            }
            await dbService.initialize();

            // 1. Load from DB
            const dbNovel = await dbService.getNovel(novelId);
            let currentNovel = dbNovel;

            let dbChaptersCount = 0;
            if (dbNovel) {
                console.log(`[useChapterData] Novel loaded from DB: id=${dbNovel.id}, lastReadChapterId=${dbNovel.lastReadChapterId}, lastReadAt=${dbNovel.lastReadAt}`);
                setNovel(dbNovel);
                let dbChapters = await dbService.getChapters(novelId);

                // Auto-repair: fix duplicate chapters left by previous sync bugs.
                // Runs once — if no duplicates exist, it returns false immediately.
                const wasRepaired = await dbService.repairDuplicateChapters(novelId);
                if (wasRepaired) {
                    console.log('[useChapterData] Duplicates repaired, reloading chapters from DB');
                    dbChapters = await dbService.getChapters(novelId);
                }

                setChapters(dbChapters);
                knownChapters = dbChapters; // keep in sync manually
                dbChaptersCount = dbChapters.length;
                setAddedToLibrary(true);
                setIsPreviewMode(false);
                setLoading(false); // Show DB content immediately

                // Map DB state to Live trackers
                // Check both content (legacy DB storage) AND contentPath (filesystem storage)
                const savedUrls = new Set(
                    dbChapters
                        .filter(c => c.content || c.contentPath) // Downloaded if either exists
                        .map(c => c.audioPath)
                        .filter(Boolean) as string[]
                );
                const readUrls = new Set(dbChapters.filter(c => c.isRead).map(c => c.audioPath).filter(Boolean) as string[]);
                setDownloadedLiveChapters(savedUrls);
                setReadLiveChapters(readUrls);

                // Populate liveChapters from DB initially so list isn't empty
                if (dbChapters.length > 0) {
                    const indexedChapters = dbChapters.map(ch => ({
                        title: ch.title,
                        url: ch.audioPath || '',
                        _index: ch.orderIndex,
                        date: ch.date
                    }));
                    setLiveChapters(indexedChapters);
                }

                // Update missing sourceUrl from state if available
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

                // Hydrate reading progress from localStorage if available (for Live novels)
                if (typeof localStorage !== 'undefined') {
                    const savedLastRead = localStorage.getItem(`lastRead:${novelId}`);
                    const savedLastReadAt = localStorage.getItem(`lastReadAt:${novelId}`);
                    if (savedLastRead) {
                        currentNovel.lastReadChapterId = savedLastRead;
                        currentNovel.lastReadAt = savedLastReadAt ? parseInt(savedLastReadAt) : Date.now();
                    }
                }

                setNovel(currentNovel);
                setIsPreviewMode(true);
                setAddedToLibrary(false);
                setLoading(false); // Render shell immediately while fetching chapters in bg
            }

            // 2. Live Sync / Smart Caching
            const sourceUrl = currentNovel?.sourceUrl || location.state?.novel?.sourceUrl;

            // Check if we need to fetch
            const now = Math.floor(Date.now() / 1000);
            const lastFetched = currentNovel?.lastFetchedAt || 0;
            const isFresh = (now - lastFetched) < 21600; // 6 hours cache
            const hasChapters = dbChaptersCount > 0;

            // Critical check: Do we actually HAVE the chapters in DB?
            // If totalChapters says 2000 but we only have 5 in DB, we must fetch the list.
            const isCacheComplete = dbChaptersCount >= (currentNovel?.totalChapters || 0) * 0.9; // 90% tolerance for rough matches

            // Should we skip fetching? 
            const hasLiveCache = cached && cached.liveChapters && cached.liveChapters.length > 0 && cached.liveChapters.length >= ((currentNovel?.totalChapters || 0) * 0.9);
            const shouldSkipFetch = (dbNovel && isFresh && hasChapters && isCacheComplete) || hasLiveCache;

            console.log(`[useChapterData] shouldSkipFetch=${shouldSkipFetch} dbCount=${dbChaptersCount} total=${currentNovel?.totalChapters} fresh=${isFresh}`);

            if (sourceUrl && navigator.onLine && !shouldSkipFetch) {
                // console.log(`[useChapterData] Triggering Live Sync for ${novelId}`);
                try {
                    const data = await scraperService.fetchNovelFast(sourceUrl, async (chaptersFound, page, metadata) => {
                        setLoadingPage(page);

                        // Incremental Update: Show chapters as they arrive!
                        if (chaptersFound.length > 0) {
                            if (page <= 1 || page % 3 === 0) {
                                const existingUrls = new Set(knownChapters.map(ch => ch.audioPath).filter(Boolean));
                                const newChapters = chaptersFound.filter(ch => !existingUrls.has(ch.url));

                                const indexedChapters = newChapters.map((ch, idx) => ({
                                    ...ch,
                                    _index: knownChapters.length + idx,
                                    date: ch.date
                                }));
                                // The scraper returns the growing list of NEW chapters, so we prepend the old ones
                                setLiveChapters([...knownChapters.map(ch => ({
                                    title: ch.title,
                                    url: ch.audioPath || '',
                                    _index: ch.orderIndex,
                                    date: ch.date
                                })), ...indexedChapters]);
                            }

                            // Unlock UI immediately after first batch
                            if (page === 1 || chaptersFound.length > 0) {
                                setLoading(false);
                            }
                        }

                        // Early Metadata Update (e.g. cover/synopsis from page 0)
                        if (metadata && currentNovel) {
                            const updatedNovel = {
                                ...currentNovel,
                                ...metadata,
                                title: (metadata.title && metadata.title !== 'Unknown Title' && metadata.title !== 'Unknown') ? metadata.title : currentNovel.title,
                                author: (metadata.author && metadata.author !== 'Unknown') ? metadata.author : currentNovel.author,
                                status: (metadata.status && metadata.status !== 'Unknown' && metadata.status !== 'Ongoing') ? metadata.status : (currentNovel.status || metadata.status),
                                totalChapters: metadata.totalChapters ?? currentNovel.totalChapters
                            } as Novel;
                            // Only update state if meaningful change to avoid flickering
                            if (updatedNovel.coverUrl !== currentNovel.coverUrl || 
                                updatedNovel.summary !== currentNovel.summary || 
                                updatedNovel.author !== currentNovel.author || 
                                updatedNovel.status !== currentNovel.status ||
                                updatedNovel.totalChapters !== currentNovel.totalChapters) {
                                setNovel(updatedNovel);
                                currentNovel = updatedNovel; // Update local ref
                            }
                        }
                    }, dbChaptersCount, signal); // pass knownChapterCount and signal

                    if (data) {
                        const existingUrls = new Set(knownChapters.map(ch => ch.audioPath).filter(Boolean));
                        const newChapters = data.chapters.filter(ch => !existingUrls.has(ch.url));

                        const indexedChapters = newChapters.map((ch, idx) => ({ ...ch, _index: knownChapters.length + idx }));
                        setLiveChapters([...knownChapters.map(ch => ({
                                    title: ch.title,
                                    url: ch.audioPath || '',
                                    _index: ch.orderIndex,
                                    date: ch.date
                        })), ...indexedChapters]);

                        // Update State & DB
                        if (dbNovel) {
                            try {
                                // 1. Update Novel Metadata FIRST (skipSave: addChapters will do the final save)
                                await dbService.addNovel({
                                    ...dbNovel,
                                    title: (data.title && data.title !== 'Unknown Title' && data.title !== 'Unknown') ? data.title : dbNovel.title,
                                    author: (data.author && data.author !== 'Unknown') ? data.author : dbNovel.author,
                                    coverUrl: data.coverUrl || dbNovel.coverUrl,
                                    summary: data.summary || dbNovel.summary,
                                    status: (data.status && data.status !== 'Unknown' && data.status !== 'Ongoing') ? data.status : (dbNovel.status || data.status),
                                    totalChapters: data.totalChapters ?? Math.max(dbNovel.totalChapters || 0, dbChaptersCount + newChapters.length),
                                    lastFetchedAt: Math.floor(Date.now() / 1000)
                                }, true);

                                // 2. Save all chapters to DB
                                // Standardize ID format: {novelId}-ch-{index}
                                const chaptersToSave: Chapter[] = indexedChapters.map(ch => ({
                                    id: `${novelId}-ch-${ch._index}`, // Deterministic ID matching Reader.tsx
                                    novelId: novelId,
                                    title: ch.title,
                                    orderIndex: ch._index,
                                    audioPath: ch.url, // Storing URL in audioPath
                                    date: ch.date
                                }));

                                await dbService.addChapters(chaptersToSave);
                                await dbService.repairDuplicateChapters(novelId);

                                // 3. Reload chapters from DB to ensure UI is in sync with DB state
                                const updatedDbChapters = await dbService.getChapters(novelId);
                                setChapters(updatedDbChapters);
                                knownChapters = updatedDbChapters; // keep in sync here too
        } catch (error) {
                                console.error("Failed to update DB in loadData", error);
                            }
                        } else {
                            // Preview Mode: Just update state, don't save to DB
                            // Ensure we preserve the coverUrl and other info from location state
                            if (currentNovel) {
                                setNovel(prev => prev ? {
                                    ...prev,
                                    title: (data.title && data.title !== 'Unknown Title' && data.title !== 'Unknown') ? data.title : prev.title,
                                    author: (data.author && data.author !== 'Unknown') ? data.author : prev.author,
                                    coverUrl: data.coverUrl || prev.coverUrl,
                                    summary: data.summary || prev.summary,
                                    status: (data.status && data.status !== 'Unknown' && data.status !== 'Ongoing') ? data.status : (prev.status || data.status),
                                    totalChapters: data.totalChapters ?? Math.max(prev.totalChapters || 0, dbChaptersCount + newChapters.length),
                                    lastFetchedAt: Math.floor(Date.now() / 1000)
                                } : null);
                            }
                        }

                        setLoading(false);
                    }
                } catch (e) {
                    console.error("Failed to fetch live chapters", e);
                    setLoading(false);
                }
            } else {
                if (shouldSkipFetch) {
                    console.log(`[useChapterData] Skipping fetch. Data is fresh & complete. Last fetched: ${new Date(lastFetched * 1000).toLocaleString()}`);
                    setLoading(false);
                } else {
                    // Offline or other case
                    setLoading(false);
                }
            }

        } catch (e) {
            if (!signal?.aborted) console.error("Failed to load novel data", e);
            setLoading(false);
        } finally {
            setLoadingPage(0);
            if (activeLoadRef.current === controller) activeLoadRef.current = null;
        }
    };

    useEffect(() => {
        const extController = new AbortController();

        const unsub = scraperService.subscribe((progress: ScraperProgress, isScraping: boolean) => {
            setScrapingProgress(progress);
            setIsGlobalScraping(isScraping);

            // Reload if scraping finished for this novel
            if (!isScraping && progress.current > 0 && progress.current === progress.total) {
                loadData(extController.signal);
            }
        });

        loadData(extController.signal);
        
        return () => {
            unsub();
            extController.abort();
            console.log('[useChapterData] unmounted, aborting scrape');
        };
    }, [novelId]);

    useEffect(() => {
        if (novelId && novel) {
            chapterListCache.set(novelId, {
                novel,
                chapters,
                liveChapters
            });
        }
    }, [novelId, novel, chapters, liveChapters]);

    // Computed filtered chapters
    const filteredChapters = useMemo(() => {
        let result: any[] = [];

        if (isLiveMode) {
            result = liveChapters.filter(ch => ch.title.toLowerCase().includes(searchQuery.toLowerCase()));
            // Apply sort order only (no read/unread filter for live list usually, but we can add if needed)
        } else {
            result = chapters.filter(chapter => {
                const matchesSearch = chapter.title.toLowerCase().includes(searchQuery.toLowerCase());
                if (!matchesSearch) return false;

                switch (filter) {
                    case 'read': return chapter.isRead;
                    case 'unread': return !chapter.isRead;
                    case 'downloaded': return chapter.content;
                    default: return true;
                }
            });
        }

        return result.sort((a, b) => {
            const indexA = isLiveMode ? a._index : a.orderIndex;
            const indexB = isLiveMode ? b._index : b.orderIndex;
            return sortOrder === 'asc' ? indexA - indexB : indexB - indexA;
        });

    }, [chapters, liveChapters, isLiveMode, filter, searchQuery, sortOrder]);

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
        setChapters // Exposed for manual updates (like single download)
    };
}
