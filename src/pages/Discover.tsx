import React, { useState, useEffect, useCallback, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Minimize2, WifiOff } from 'lucide-react';
import { scraperService, type ScraperProgress, type NovelMetadata } from '../services/scraper.service';
import { manhwaScraperService } from '../services/manhwaScraper.service';
import { App as CapacitorApp } from '@capacitor/app';
import { FooterNavigation } from '../components/FooterNavigation';
import { CompletionModal } from '../components/CompletionModal';
import { DiscoverHeader } from '../components/discover/DiscoverHeader';
import { NovelDiscoverSection } from '../components/discover/NovelDiscoverSection';
import { ManhwaDiscoverSection } from '../components/discover/ManhwaDiscoverSection';
import { DiscoverSyncModal } from '../components/discover/DiscoverSyncModal';
import { dbService } from '../services/db.service';

const GlobalScrapingBar = memo(({ isGlobalScraping, scrapingProgress }: { isGlobalScraping: boolean, scrapingProgress: ScraperProgress }) => {
    if (!isGlobalScraping) return null;
    return (
        <div className="px-4 pb-2 animate-in slide-in-from-top-2 duration-300">
            <div className="bg-primary/10 border border-primary/20 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                        <div className="size-4 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
                        <span className="text-[11px] font-bold text-primary uppercase tracking-wider">
                            {isGlobalScraping ? `Scraping: ${scrapingProgress.currentTitle}` : 'Loading Metadata...'}
                        </span>
                    </div>
                    <span className="text-[11px] font-bold text-primary">
                        {isGlobalScraping ? `${scrapingProgress.current}/${scrapingProgress.total}` : ''}
                    </span>
                </div>
                {isGlobalScraping && (
                    <div className="h-1.5 w-full bg-primary/20 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-primary transition-all duration-300"
                            style={{ width: `${scrapingProgress.total > 0 ? (scrapingProgress.current / scrapingProgress.total) * 100 : 0}%` }}
                        ></div>
                    </div>
                )}
                <div className="flex items-center gap-2 mt-2 opacity-70">
                    <Minimize2 size={12} className="text-primary" />
                    <span className="text-[10px] text-primary font-medium">Runs in background</span>
                </div>
            </div>
        </div>
    );
});

export const Discover = () => {
    const navigate = useNavigate();
    const [searchQuery, setSearchQuery] = useState('');
    const [homeData, setHomeData] = useState<any>(null);
    const [isSyncingHome, setIsSyncingHome] = useState(false);
    const [scrapingProgress, setScrapingProgress] = useState<ScraperProgress>(scraperService.progress);
    const [isGlobalScraping, setIsGlobalScraping] = useState(scraperService.isScraping);
    const [syncProgress, setSyncProgress] = useState<{ task: string; current: number; total: number }>({ task: '', current: 0, total: 0 });
    const [showSyncModal, setShowSyncModal] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [mode, setMode] = useState<'novels' | 'manhwa'>('novels');
    const [manhwaData, setManhwaData] = useState<{ trending: any[], popular: any[], latest: any[] } | null>(null);
    const [isLoadingManhwa, setIsLoadingManhwa] = useState(false);
    const [novelSearchResults, setNovelSearchResults] = useState<NovelMetadata[]>([]);
    const [isSearchingNovels, setIsSearchingNovels] = useState(false);
    const [searchPerformed, setSearchPerformed] = useState(false);
    const [isOffline, setIsOffline] = useState(!navigator.onLine);

    // Initial Load & Listeners
    useEffect(() => {
        loadHomeData();

        const handleOnline = () => setIsOffline(false);
        const handleOffline = () => setIsOffline(true);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        const unsub = scraperService.subscribe((progress, isGlobalScraping) => {
            setScrapingProgress(progress);
            setIsGlobalScraping(isGlobalScraping);
        });

        const appStateListener = CapacitorApp.addListener('appStateChange', (state) => {
            if (state.isActive) {
                console.log('[Discover] App resumed, refreshing data...');
                loadHomeData();
                if (mode === 'manhwa') loadManhwaData();
            }
        });

        // Listen for internal sync completion (custom event)
        const handleSyncComplete = () => {
            console.log('[Discover] Sync complete event received, refreshing...');
            loadHomeData();
        };
        window.addEventListener('sync-complete', handleSyncComplete);

        return () => {
            unsub();
            appStateListener.then(handle => handle.remove());
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            window.removeEventListener('sync-complete', handleSyncComplete);
        };
    }, []);

    // Load Manhwa Data when switching tabs
    useEffect(() => {
        if (mode === 'manhwa' && !manhwaData) {
            loadManhwaData();
        }
    }, [mode]);

    const loadHomeData = async () => {
        try {
            // Try DB cache first
            const cached = await dbService.getCache('homeData');
            if (cached) {
                setHomeData(cached);
            } else {
                // Fallback to localStorage if DB empty (migration)
                const stored = localStorage.getItem('homeData');
                if (stored) setHomeData(JSON.parse(stored));
            }
        } catch (e) {
            console.error("Failed to load home data", e);
        }
    };

    const loadManhwaData = async () => {
        // Try DB cache first
        const cached = await dbService.getCache('manhwaDiscoveryData');
        if (cached) {
            setManhwaData(cached);
        }

        if (navigator.onLine) {
            setIsLoadingManhwa(true);
            try {
                const data = await manhwaScraperService.getDiscoveryData();
                if (data && (data.trending.length > 0 || data.popular.length > 0 || data.latest.length > 0)) {
                    setManhwaData(data);
                    await dbService.setCache('manhwaDiscoveryData', data);
                }
            } catch (e) {
                console.error("Failed to load manhwa discovery data", e);
            } finally {
                setIsLoadingManhwa(false);
            }
        }
    };

    const syncHomeData = useCallback(async () => {
        if (!navigator.onLine) {
            alert("No internet connection available for sync.");
            return;
        }

        setIsSyncingHome(true);
        setShowSyncModal(true);
        try {
            console.log("Syncing discover data...");
            const data = await scraperService.syncAllDiscoverData((task: string, current: number, total: number) => {
                setSyncProgress({ task, current, total });
            });

            if (data && (data.recommended.length > 0 || data.ranking.length > 0 || data.latest.length > 0)) {
                setHomeData(data);
                await dbService.setCache('homeData', data);
                setShowSuccess(true);
            } else {
                alert("Sync returned empty data. Please try again.");
            }
        } catch (e) {
            console.error("Failed to sync discover data", e);
            alert("Error syncing data: " + (e instanceof Error ? e.message : String(e)));
        } finally {
            setIsSyncingHome(false);
            setShowSyncModal(false);
        }
    }, []);

    const performQuickScrape = async (url: string) => {
        const isManhwa = mode === 'manhwa' || url.includes('asura') || url.includes('mangadex');
        if (isManhwa) {
            navigate('/import', { state: { initialUrl: url } });
            return;
        }
        if (confirm("Start quick scrape for this novel?")) {
            try {
                const novel = await scraperService.fetchNovel(url);
                scraperService.startImport(url, novel);
            } catch (e) {
                console.error(e);
                alert("Quick scrape failed");
            }
        }
    };

    const handleSearch = useCallback(async (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && searchQuery) {
            if (searchQuery.startsWith('http')) {
                await performQuickScrape(searchQuery);
            } else {
                if (mode === 'manhwa') {
                    navigate('/import', { state: { initialQuery: searchQuery } });
                } else {
                    // Search novels on NovelFire
                    setIsSearchingNovels(true);
                    setSearchPerformed(true);
                    setNovelSearchResults([]);
                    try {
                        const results = await scraperService.searchNovels(searchQuery);
                        setNovelSearchResults(results);
                    } catch (e) {
                        console.error('Novel search failed:', e);
                    } finally {
                        setIsSearchingNovels(false);
                    }
                }
            }
        }
    }, [searchQuery, mode, navigate]);

    return (
        <div className="h-screen w-full flex flex-col bg-background-light dark:bg-background-dark font-sans selection:bg-primary/30 overflow-hidden">
            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto pb-24">
                <DiscoverHeader
                    profileImage={localStorage.getItem('profileImage') || ''}
                    isSyncingHome={isSyncingHome}
                    isGlobalScraping={isGlobalScraping}
                    isFilterOpen={isFilterOpen}
                    setIsFilterOpen={setIsFilterOpen}
                    syncHomeData={syncHomeData}
                    searchQuery={searchQuery}
                    setSearchQuery={setSearchQuery}
                    handleSearch={handleSearch}
                    mode={mode}
                    setMode={setMode}
                    navigate={navigate}
                />

                {isOffline && (
                    <div className="bg-red-500 text-white text-xs font-bold text-center py-1">
                        <WifiOff className="inline-block w-3 h-3 mr-1" />
                        You are in offline mode. Discovery features are limited.
                    </div>
                )}

                <GlobalScrapingBar isGlobalScraping={isGlobalScraping} scrapingProgress={scrapingProgress} />

                {/* Content */}
                <div className="flex flex-col gap-6 pt-2">
                    {mode === 'novels' ? (
                        <NovelDiscoverSection
                            homeData={homeData}
                            isSearchingNovels={isSearchingNovels}
                            searchPerformed={searchPerformed}
                            novelSearchResults={novelSearchResults}
                            searchQuery={searchQuery}
                            onClearSearch={() => { setSearchPerformed(false); setNovelSearchResults([]); setSearchQuery(''); }}
                        />
                    ) : (
                        <ManhwaDiscoverSection
                            manhwaData={manhwaData}
                            isLoadingManhwa={isLoadingManhwa}
                            loadManhwaData={loadManhwaData}
                        />
                    )}
                </div>
            </div>

            <FooterNavigation />

            <CompletionModal
                isOpen={showSuccess}
                onClose={() => setShowSuccess(false)}
                title="Sync Successful!"
                message="The discover page has been refreshed with the latest data."
            />

            <DiscoverSyncModal showSyncModal={showSyncModal} syncProgress={syncProgress} />
        </div>
    );
};
