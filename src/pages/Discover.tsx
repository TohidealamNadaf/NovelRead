import React, { useState, useEffect, useCallback, memo, useRef } from 'react';
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
import { useProfileImage } from '../hooks/useProfileImage';
import { PullToRefresh } from '../components/PullToRefresh';

const GlobalScrapingBar = memo(({ isGlobalScraping, scrapingProgress }: { isGlobalScraping: boolean, scrapingProgress: ScraperProgress }) => {
    if (!isGlobalScraping) return null;
    return (
        <div className="px-4 pb-3 animate-in slide-in-from-top-2 fade-in duration-300">
            <div className="bg-white/80 dark:bg-[#2b2839]/80 backdrop-blur-md border border-primary/20 rounded-2xl p-3 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 overflow-hidden mr-2">
                        <div className="size-3.5 shrink-0 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
                        <span className="text-[11px] font-bold text-primary uppercase tracking-wider truncate">
                            {isGlobalScraping ? `Scraping: ${scrapingProgress.currentTitle || 'Data'}` : 'Loading Metadata...'}
                        </span>
                    </div>
                    <span className="text-[11px] shrink-0 font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-md">
                        {isGlobalScraping ? `${scrapingProgress.current}/${scrapingProgress.total}` : ''}
                    </span>
                </div>
                {isGlobalScraping && (
                    <div className="h-1.5 w-full bg-slate-100 dark:bg-black/20 rounded-full overflow-hidden shadow-inner">
                        <div
                            className="h-full bg-primary transition-all duration-300 relative overflow-hidden"
                            style={{ width: `${scrapingProgress.total > 0 ? (scrapingProgress.current / scrapingProgress.total) * 100 : 0}%` }}
                        >
                            <div className="absolute inset-0 bg-white/30 animate-[shimmer_1.5s_infinite] -skew-x-12"></div>
                        </div>
                    </div>
                )}
                <div className="flex items-center gap-1.5 mt-2 opacity-70">
                    <Minimize2 size={12} className="text-primary" />
                    <span className="text-[10px] text-primary font-medium tracking-wide">Runs in background</span>
                </div>
            </div>
        </div>
    );
});

export const Discover = () => {
    const navigate = useNavigate();
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [homeData, setHomeData] = useState<Record<string, any>>({});
    const [isSyncingHome, setIsSyncingHome] = useState(false);
    const [scrapingProgress, setScrapingProgress] = useState<ScraperProgress>(scraperService.progress);
    const [isGlobalScraping, setIsGlobalScraping] = useState(scraperService.isScraping);
    const [syncProgress, setSyncProgress] = useState<{ task: string; current: number; total: number }>({ task: '', current: 0, total: 0 });
    const [showSyncModal, setShowSyncModal] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [mode, setMode] = useState<'novelfire' | 'freewebnovel' | 'manhwa'>(() => {
        return (sessionStorage.getItem('discoverTabMode') as 'novelfire' | 'freewebnovel' | 'manhwa') || 'novelfire';
    });
    const [manhwaData, setManhwaData] = useState<{ trending: any[], popular: any[], latest: any[] } | null>(null);
    const [isLoadingManhwa, setIsLoadingManhwa] = useState(false);
    const [novelSearchResults, setNovelSearchResults] = useState<NovelMetadata[]>([]);
    const [isSearchingNovels, setIsSearchingNovels] = useState(false);
    
    // Manhwa Search State
    const [manhwaSearchResults, setManhwaSearchResults] = useState<NovelMetadata[]>([]);
    const [isSearchingManhwa, setIsSearchingManhwa] = useState(false);
    
    
    const [searchPerformed, setSearchPerformed] = useState(false);
    const [isOffline, setIsOffline] = useState(!navigator.onLine);
    const profileImage = useProfileImage();

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

    // Load data when switching tabs
    useEffect(() => {
        sessionStorage.setItem('discoverTabMode', mode);
        if (mode === 'manhwa') {
            loadManhwaData();
        } else if (mode === 'novelfire' || mode === 'freewebnovel') {
            if (!homeData[mode]) loadHomeData(mode);
        }
    }, [mode, homeData]);

    const loadHomeData = async (currentMode: 'novelfire' | 'freewebnovel' | 'manhwa' = mode) => {
        if (currentMode === 'manhwa') return;
        try {
            const cacheKey = `homeData_${currentMode}`;
            const cached = await dbService.getCache(cacheKey);
            if (cached) {
                setHomeData(prev => ({ ...prev, [currentMode]: cached }));
            } else if (currentMode === 'novelfire') {
                // Fallback for old cache key format
                const oldCached = await dbService.getCache('homeData');
                if (oldCached) {
                    setHomeData(prev => ({ ...prev, novelfire: oldCached }));
                } else {
                    const stored = localStorage.getItem('homeData');
                    if (stored) setHomeData(prev => ({ ...prev, novelfire: JSON.parse(stored) }));
                }
            }
            
            // If still empty after cache checks, trigger an automatic sync
            setTimeout(() => {
                setHomeData(current => {
                    if (!current[currentMode]) {
                        console.log(`[Discover] No cache for ${currentMode}, auto-syncing...`);
                        syncHomeData(currentMode);
                    }
                    return current;
                });
            }, 500);
        } catch (e) {
            console.error("Failed to load home data", e);
        }
    };

    const loadManhwaData = async () => {
        const cacheKey = 'manhwaDiscoveryData';
        
        // Try DB cache first
        const cached = await dbService.getCache(cacheKey);
        if (cached) {
            setManhwaData(cached);
        } else {
            setManhwaData(null); // clear if switching to uncached source
        }

        if (navigator.onLine) {
            setIsLoadingManhwa(true);
            try {
                const data = await manhwaScraperService.getDiscoveryData();
                if (data && (data.trending.length > 0 || data.popular.length > 0 || data.latest.length > 0)) {
                    setManhwaData(data);
                    await dbService.setCache(cacheKey, data);
                }
            } catch (e) {
                console.error("Failed to load manhwa discovery data", e);
            } finally {
                setIsLoadingManhwa(false);
            }
        }
    };

    const syncHomeData = useCallback(async (targetModeOrEvent?: 'novelfire' | 'freewebnovel' | 'manhwa' | any) => {
        const actualTargetMode = typeof targetModeOrEvent === 'string' ? targetModeOrEvent : mode;

        if (!navigator.onLine) {
            alert("No internet connection available for sync.");
            return;
        }

        if (actualTargetMode === 'manhwa') {
            loadManhwaData();
            return;
        }

        setIsSyncingHome(true);
        setShowSyncModal(true);
        try {
            console.log(`Syncing discover data for ${actualTargetMode}...`);
            const data = await scraperService.syncAllDiscoverData((task: string, current: number, total: number) => {
                setSyncProgress({ task, current, total });
            }, actualTargetMode as 'novelfire' | 'freewebnovel');

            if (data && (data.recommended.length > 0 || data.ranking.length > 0 || data.latest.length > 0)) {
                setHomeData(prev => ({ ...prev, [actualTargetMode]: data }));
                await dbService.setCache(`homeData_${actualTargetMode}`, data);
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
    }, [mode]);

    const performQuickScrape = async (url: string) => {
        const isManhwa = mode === 'manhwa' || url.includes('asura');
        if (isManhwa) {
            navigate(`/manhwa/${encodeURIComponent(url)}`);
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
            if (scrollContainerRef.current) {
                scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
            }
            if (searchQuery.startsWith('http')) {
                await performQuickScrape(searchQuery);
            } else {
                setSearchPerformed(true);
                if (mode === 'manhwa') {
                    // Search manhwas
                    setIsSearchingManhwa(true);
                    setManhwaSearchResults([]);
                    try {
                        const results = await manhwaScraperService.searchManga(searchQuery);
                        setManhwaSearchResults(results);
                    } catch (e) {
                        console.error('Manhwa search failed:', e);
                    } finally {
                        setIsSearchingManhwa(false);
                    }
                } else {
                    // Search novels
                    setIsSearchingNovels(true);
                    setNovelSearchResults([]);
                    try {
                        const results = await scraperService.searchNovels(searchQuery, mode as 'novelfire' | 'freewebnovel');
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

    const header = (
        <DiscoverHeader
            profileImage={profileImage}
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
    );

    return (
        <div className="h-screen w-full flex flex-col bg-background-light dark:bg-background-dark font-sans selection:bg-primary/30 overflow-hidden">
            {/* Scrollable Content */}
            <PullToRefresh 
                ref={scrollContainerRef}
                onRefresh={() => syncHomeData()}
                isDisabled={isGlobalScraping}
                className="pb-24"
                header={header}
            >

                {isOffline && (
                    <div className="bg-red-500 text-white text-xs font-bold text-center py-1">
                        <WifiOff className="inline-block w-3 h-3 mr-1" />
                        You are in offline mode. Discovery features are limited.
                    </div>
                )}

                <GlobalScrapingBar isGlobalScraping={isGlobalScraping} scrapingProgress={scrapingProgress} />

                {/* Content */}
                <div className="flex flex-col gap-6 pt-2">
                    {mode === 'novelfire' || mode === 'freewebnovel' ? (
                        <NovelDiscoverSection
                            homeData={homeData[mode]}
                            source={mode}
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
                            isSearchingManhwa={isSearchingManhwa}
                            searchPerformed={searchPerformed}
                            manhwaSearchResults={manhwaSearchResults}
                            searchQuery={searchQuery}
                            onClearSearch={() => { setSearchPerformed(false); setManhwaSearchResults([]); setSearchQuery(''); }}
                        />
                    )}
                </div>
            </PullToRefresh>

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
