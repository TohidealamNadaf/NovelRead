import { useState, useEffect, useMemo } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { dbService, type Novel, type Chapter } from '../services/db.service';
import { scraperService, type ScraperProgress } from '../services/scraper.service';

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

    const loadData = async () => {
        if (!novelId) return;

        try {
            setLoading(true);
            await dbService.initialize();

            // 1. Load from DB
            const dbNovel = await dbService.getNovel(novelId);
            let currentNovel = dbNovel;

            if (dbNovel) {
                setNovel(dbNovel);
                const dbChapters = await dbService.getChapters(novelId);
                setChapters(dbChapters);
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
            }

            // 2. Live Sync / Smart Caching
            const sourceUrl = currentNovel?.sourceUrl || location.state?.novel?.sourceUrl;

            // Check if we need to fetch
            const now = Math.floor(Date.now() / 1000);
            const lastFetched = currentNovel?.lastFetchedAt || 0;
            const isFresh = (now - lastFetched) < 21600; // 6 hours cache
            const hasChapters = (currentNovel?.totalChapters || 0) > 0;

            // Critical check: Do we actually HAVE the chapters in DB?
            // If totalChapters says 2000 but we only have 5 in DB, we must fetch the list.
            const dbChaptersCount = chapters ? chapters.length : 0; // Use the 'chapters' state which is from DB
            const isCacheComplete = dbChaptersCount >= (currentNovel?.totalChapters || 0) * 0.9; // 90% tolerance for rough matches

            // Should we skip fetching? 
            const shouldSkipFetch = dbNovel && isFresh && hasChapters && isCacheComplete;

            if (sourceUrl && navigator.onLine && !shouldSkipFetch) {
                // console.log(`[useChapterData] Triggering Live Sync for ${novelId}`);
                try {
                    const data = await scraperService.fetchNovelFast(sourceUrl, async (_chaptersFound, page, _metadata) => {
                        setLoadingPage(page);
                        // Progress update - we don't save to DB yet, wait for full list or chunks
                    });

                    if (data) {
                        const indexedChapters = data.chapters.map((ch, idx) => ({ ...ch, _index: idx }));
                        setLiveChapters(indexedChapters);

                        // Update DB with new fetch timestamp and total count
                        if (dbNovel || novelId) { // Ensure we have an ID to save to
                            // 1. Save all chapters to DB to ensure cache is complete for next time
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

                            // 2. Update Novel Metadata
                            await dbService.addNovel({
                                ...(dbNovel || {
                                    id: novelId,
                                    title: data.title || currentNovel?.title || 'Unknown',
                                    sourceUrl: sourceUrl,
                                    category: 'Novel'
                                } as any),
                                totalChapters: data.chapters.length,
                                lastFetchedAt: Math.floor(Date.now() / 1000)
                            });

                            // 3. Reload chapters from DB to ensure UI is in sync with DB state
                            const updatedDbChapters = await dbService.getChapters(novelId);
                            setChapters(updatedDbChapters);
                            setLoading(false);
                        }
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
            console.error("Failed to load novel data", e);
            setLoading(false);
        } finally {
            setLoadingPage(0);
        }
    };

    useEffect(() => {
        const unsub = scraperService.subscribe((progress: ScraperProgress, isScraping: boolean) => {
            setScrapingProgress(progress);
            setIsGlobalScraping(isScraping);

            // Reload if scraping finished for this novel
            if (!isScraping && progress.current > 0 && progress.current === progress.total) {
                loadData();
            }
        });

        loadData();
        return unsub;
    }, [novelId, location.state, location.key]);

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
