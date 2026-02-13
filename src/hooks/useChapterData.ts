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
                const savedUrls = new Set(dbChapters.filter(c => c.content).map(c => c.audioPath).filter(Boolean) as string[]);
                const readUrls = new Set(dbChapters.filter(c => c.isRead).map(c => c.audioPath).filter(Boolean) as string[]);
                setDownloadedLiveChapters(savedUrls);
                setReadLiveChapters(readUrls);

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
                setNovel(currentNovel);
                setIsPreviewMode(true);
                setAddedToLibrary(false);
            }

            // 2. Live Sync
            const sourceUrl = currentNovel?.sourceUrl || location.state?.novel?.sourceUrl;
            if (sourceUrl && navigator.onLine) {
                // console.log(`[useChapterData] Triggering Live Sync for ${novelId}`);
                try {
                    const data = await scraperService.fetchNovelFast(sourceUrl, (chaptersFound, page, metadata) => {
                        setLoadingPage(page);
                        const indexedChapters = chaptersFound.map((ch, idx) => ({ ...ch, _index: idx }));
                        setLiveChapters(indexedChapters);

                        if (metadata) {
                            setNovel(prev => prev ? {
                                ...prev,
                                ...metadata,
                                title: metadata.title || prev.title,
                                sourceUrl: sourceUrl,
                            } : prev);
                        }
                        setLoading(false);
                    });

                    if (data) {
                        const indexedChapters = data.chapters.map((ch, idx) => ({ ...ch, _index: idx }));
                        setLiveChapters(indexedChapters);
                    }
                } catch (e) {
                    console.error("Failed to fetch live chapters", e);
                } finally {
                    setLoading(false);
                }
            } else {
                setLoading(false);
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
    }, [novelId, location.state]);

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
