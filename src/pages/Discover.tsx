import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Search, Bolt, BookOpen, Filter, RefreshCcw, Minimize2 } from 'lucide-react';
import { scraperService, type ScraperProgress } from '../services/scraper.service';
import { App as CapacitorApp } from '@capacitor/app';
import { FooterNavigation } from '../components/FooterNavigation';
import { Header } from '../components/Header';
import { CompletionModal } from '../components/CompletionModal';

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

    useEffect(() => {
        loadHomeData();

        const unsub = scraperService.subscribe((progress, isGlobalScraping) => {
            setScrapingProgress(progress);
            setIsGlobalScraping(isGlobalScraping);
        });

        // Listen for background completion to refresh
        if (CapacitorApp) {
            CapacitorApp.addListener('appStateChange', (state) => {
                if (state.isActive) {
                    loadHomeData();
                }
            });
        }

        return () => {
            unsub();
            CapacitorApp.removeAllListeners();
        };
    }, []);

    const loadHomeData = async () => {
        const stored = localStorage.getItem('homeData');
        if (stored) {
            setHomeData(JSON.parse(stored));
        } else {
            // Auto sync if no data
            // syncHomeData(); // Optional: don't auto sync to save bandwidth/proxy limits on dev
        }
    };

    const syncHomeData = async () => {
        setIsSyncingHome(true);
        setShowSyncModal(true);
        try {
            console.log("Syncing discover data...");
            const data = await scraperService.syncAllDiscoverData((task: string, current: number, total: number) => {
                setSyncProgress({ task, current, total });
            });
            console.log("Synced data:", data);

            if (data && (data.recommended.length > 0 || data.ranking.length > 0 || data.latest.length > 0)) {
                setHomeData(data);
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
    };

    const handleSearch = async (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && searchQuery) {
            if (searchQuery.startsWith('http')) {
                await performQuickScrape(searchQuery);
            } else {
                alert(`Searching for: ${searchQuery}`);
            }
        }
    };

    const performQuickScrape = async (url: string) => {
        if (confirm("Start quick scrape for this novel?")) {
            // We don't have a local isScraping state anymore, rely on global
            try {
                const novel = await scraperService.fetchNovel(url);
                scraperService.startImport(url, novel);
                // The subscription will handle the rest
            } catch (e) {
                console.error(e);
                alert("Quick scrape failed");
            }
        }
    };

    return (
        <div className="h-screen w-full flex flex-col bg-background-light dark:bg-background-dark font-sans selection:bg-primary/30 overflow-hidden">
            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto pb-24">
                {/* Header */}
                {/* Header */}
                <div className="sticky top-0 z-20 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md">
                    <Header
                        title="Discover"
                        transparent
                        leftContent={
                            <Link to="/profile" className="flex size-10 shrink-0 items-center overflow-hidden rounded-full ring-2 ring-primary/20 transition-transform active:scale-95">
                                <div className="bg-center bg-no-repeat aspect-square bg-cover size-full" style={{ backgroundImage: `url("${localStorage.getItem('profileImage') || 'https://img.freepik.com/free-psd/3d-illustration-person-with-sunglasses_23-2149436188.jpg'}")` }}></div>
                            </Link>
                        }
                        rightActions={
                            <div className="flex w-20 items-center justify-end gap-1 relative">
                                <button
                                    onClick={syncHomeData}
                                    disabled={isGlobalScraping}
                                    className={`flex items-center justify-center p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors ${isSyncingHome ? 'animate-spin opacity-50' : ''}`}
                                >
                                    <RefreshCcw size={20} className="text-primary" />
                                </button>
                                <button
                                    onClick={() => setIsFilterOpen(!isFilterOpen)}
                                    className="flex items-center justify-center p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                                >
                                    <Filter className="text-primary" size={20} />
                                </button>
                                {isFilterOpen && (
                                    <div className="absolute top-full right-0 mt-2 w-48 bg-white dark:bg-[#1c1c1e] rounded-xl shadow-xl border border-slate-200 dark:border-white/10 py-2 z-50 animate-in fade-in zoom-in-95 duration-200 cursor-default" onClick={(e) => e.stopPropagation()}>
                                        <div className="fixed inset-0 z-[-1]" onClick={() => setIsFilterOpen(false)}></div>
                                        <h3 className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-500">Categories</h3>
                                        {['Fantasy', 'Sci-Fi', 'Romance', 'Action', 'Mystery', 'Horror'].map(cat => (
                                            <button
                                                key={cat}
                                                onClick={() => {
                                                    navigate(`/discover/${cat.toLowerCase()}`);
                                                    setIsFilterOpen(false);
                                                }}
                                                className="w-full text-left px-4 py-2 text-sm font-medium hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                                            >
                                                {cat}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        }
                    />

                    <div className="px-4 py-3">
                        <label className="flex flex-col min-w-40 h-11 w-full">
                            <div className="flex w-full flex-1 items-stretch rounded-xl h-full bg-slate-200/50 dark:bg-[#2b2839]">
                                <div className="text-slate-500 dark:text-[#a19db9] flex items-center justify-center pl-4">
                                    <Search size={20} />
                                </div>
                                <input
                                    className="flex w-full min-w-0 flex-1 border-none bg-transparent focus:outline-0 focus:ring-0 text-base font-normal placeholder:text-slate-500 dark:placeholder:text-[#a19db9] px-3"
                                    placeholder="Search titles or paste URL..."
                                    value={searchQuery}
                                    id="search-input"
                                    name="search-query"
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    onKeyDown={handleSearch}
                                    disabled={isGlobalScraping}
                                />
                                {isGlobalScraping && (
                                    <div className="flex items-center pr-3">
                                        <div className="size-4 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
                                    </div>
                                )}
                            </div>
                        </label>
                    </div>

                    {/* Global Scraping Progress Bar */}
                    {(isGlobalScraping) && (
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
                                            style={{ width: `${(scrapingProgress.current / scrapingProgress.total) * 100}%` }}
                                        ></div>
                                    </div>
                                )}
                                <div className="flex items-center gap-2 mt-2 opacity-70">
                                    <Minimize2 size={12} className="text-primary" />
                                    <span className="text-[10px] text-primary font-medium">Runs in background</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Content */}
                <div className="flex flex-col gap-6">
                    {/* Recommended - if empty show nothing or skeleton */}
                    {!homeData && (
                        <div className="flex flex-col items-center justify-center py-10 opacity-50">
                            <RefreshCcw className="animate-spin mb-2" size={24} />
                            <p className="text-sm font-medium">Fetching dynamic content...</p>
                        </div>
                    )}

                    {/* Recommends (from synced pools) */}
                    {homeData?.recommended?.length > 0 && (
                        <div className="flex flex-col gap-3">
                            <div className="flex items-center justify-between px-4">
                                <h3 className="text-lg font-bold tracking-tight">Recommends</h3>
                                <button onClick={() => navigate('/discover/recommended')} className="text-primary text-sm font-medium">See all</button>
                            </div>
                            <div className="carousel-container flex overflow-x-auto gap-4 px-4 hide-scrollbar snap-x snap-mandatory">
                                {homeData.recommended.slice(0, 10).map((novel: any, idx: number) => (
                                    <div
                                        key={idx}
                                        className="carousel-item flex-none w-[85%] aspect-[16/9] relative rounded-2xl overflow-hidden shadow-xl snap-center shrink-0 cursor-pointer active:scale-[0.98] transition-transform"
                                        onClick={() => navigate(`/novel/${novel.title.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '-').toLowerCase().slice(0, 24)}`, { state: { novel } })}
                                    >
                                        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url('${novel.coverUrl}')` }}></div>
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>
                                        <div className="absolute bottom-4 left-4 right-4">
                                            <span className="bg-primary/90 backdrop-blur-sm text-white text-[10px] font-bold px-2.5 py-1 rounded-lg uppercase tracking-wider mb-2 inline-block">Recommended</span>
                                            <h4 className="text-white text-xl font-bold leading-tight line-clamp-1">{novel.title}</h4>
                                            <p className="text-white/70 text-sm line-clamp-1">{novel.author || 'Best of NovelFire'}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Ranking List */}
                    {homeData?.ranking?.length > 0 && (
                        <div className="flex flex-col gap-3">
                            <div className="flex items-center justify-between px-4">
                                <h3 className="text-lg font-bold tracking-tight">Top Ranking</h3>
                                <button onClick={() => navigate('/discover/ranking')} className="text-primary text-sm font-medium">View More</button>
                            </div>
                            <div className="flex overflow-x-auto gap-4 px-4 hide-scrollbar">
                                {homeData.ranking.slice(0, 10).map((novel: any, idx: number) => (
                                    <div
                                        key={idx}
                                        className="flex-none w-32 flex flex-col gap-2 cursor-pointer active:scale-95 transition-transform"
                                        onClick={() => navigate(`/novel/${novel.title.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '-').toLowerCase().slice(0, 24)}`, { state: { novel } })}
                                    >
                                        <div className="relative aspect-[2/3] w-full rounded-xl overflow-hidden shadow-lg border border-slate-100 dark:border-white/5">
                                            {novel.coverUrl ? (
                                                <img src={novel.coverUrl} className="absolute inset-0 w-full h-full object-cover" alt={novel.title} />
                                            ) : (
                                                <div className="absolute inset-0 bg-slate-300 dark:bg-[#2b2839] flex items-center justify-center">
                                                    <BookOpen className="text-4xl text-slate-400" />
                                                </div>
                                            )}
                                            <div className="absolute top-1.5 left-1.5 bg-black/60 backdrop-blur-sm text-white min-w-[24px] px-1.5 h-6 flex items-center justify-center rounded-lg font-bold text-[10px] shadow-sm">
                                                #{idx + 1}
                                            </div>
                                        </div>
                                        <div className="flex flex-col px-0.5">
                                            <p className="font-bold text-[13px] line-clamp-2 text-slate-900 dark:text-white leading-tight">{novel.title}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Latest Updates */}
                    {homeData?.latest?.length > 0 && (
                        <div className="flex flex-col gap-3">
                            <div className="flex items-center justify-between px-4">
                                <h3 className="text-lg font-bold tracking-tight">Latest Updates</h3>
                                <button onClick={() => navigate('/discover/latest')} className="text-primary text-sm font-medium">See all</button>
                            </div>
                            <div className="flex flex-col px-4 gap-3">
                                {homeData.latest.slice(0, 10).map((novel: any, idx: number) => (
                                    <div
                                        key={idx}
                                        className="flex items-center gap-4 bg-white dark:bg-[#121118] p-3 rounded-[20px] border border-slate-200 dark:border-white/5 active:scale-[0.98] transition-all cursor-pointer shadow-sm shadow-slate-200/50 dark:shadow-none"
                                        onClick={() => navigate(`/novel/${novel.title.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '-').toLowerCase().slice(0, 24)}`, { state: { novel } })}
                                    >
                                        <div className="size-16 rounded-xl overflow-hidden shrink-0 border border-slate-100 dark:border-white/10 shadow-sm">
                                            {novel.coverUrl ? (
                                                <img src={novel.coverUrl} className="w-full h-full object-cover" alt={novel.title} />
                                            ) : (
                                                <div className="w-full h-full bg-slate-200 dark:bg-[#2b2839] flex items-center justify-center text-slate-400">
                                                    <BookOpen size={24} />
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h4 className="font-bold text-[15px] truncate text-slate-900 dark:text-white mb-1">{novel.title}</h4>
                                            <p className="text-[11px] text-slate-500 dark:text-[#a19db9] line-clamp-2 font-medium leading-normal">
                                                {novel.summary || novel.author || 'Recently updated release.'}
                                            </p>
                                        </div>
                                        <div className="pr-1">
                                            <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center">
                                                <Bolt size={18} className="text-primary" />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Recently Added (from AJAX or Fallback) */}
                    {homeData?.recentlyAdded?.length > 0 && (
                        <div className="flex flex-col gap-3">
                            <div className="flex items-center justify-between px-4">
                                <h3 className="text-lg font-bold tracking-tight">Recently Added</h3>
                                <button onClick={() => navigate('/discover/recentlyAdded')} className="text-primary text-sm font-medium">See all</button>
                            </div>
                            <div className="flex overflow-x-auto gap-4 px-4 hide-scrollbar">
                                {homeData.recentlyAdded.slice(0, 10).map((novel: any, idx: number) => (
                                    <div
                                        key={idx}
                                        className="flex-none w-28 flex flex-col gap-2 cursor-pointer active:scale-95 transition-transform"
                                        onClick={() => navigate(`/novel/${novel.title.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '-').toLowerCase().slice(0, 24)}`, { state: { novel } })}
                                    >
                                        <div className="relative aspect-[2/3] w-full rounded-xl overflow-hidden shadow-sm border border-slate-100 dark:border-white/5">
                                            {novel.coverUrl ? (
                                                <img src={novel.coverUrl} className="absolute inset-0 w-full h-full object-cover" alt={novel.title} />
                                            ) : (
                                                <div className="absolute inset-0 bg-slate-300 dark:bg-[#2b2839] flex items-center justify-center">
                                                    <BookOpen className="text-2xl text-slate-400" />
                                                </div>
                                            )}
                                            <div className="absolute top-1 left-1 bg-blue-500/90 backdrop-blur-sm text-white text-[8px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wide">NEW</div>
                                        </div>
                                        <div className="flex flex-col px-0.5">
                                            <p className="font-bold text-[12px] line-clamp-2 text-slate-900 dark:text-white leading-tight">{novel.title}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Completed Stories */}
                    {homeData?.completed?.length > 0 && (
                        <div className="flex flex-col gap-4">
                            <div className="flex items-center justify-between px-4">
                                <h3 className="text-lg font-bold tracking-tight">Completed Stories</h3>
                                <button onClick={() => navigate('/discover/completed')} className="text-primary text-sm font-medium">See all</button>
                            </div>
                            <div className="flex overflow-x-auto gap-4 px-4 hide-scrollbar">
                                {homeData.completed.slice(0, 10).map((novel: any, idx: number) => (
                                    <div
                                        key={idx}
                                        className="flex-none w-32 flex flex-col gap-2 cursor-pointer active:scale-95 transition-transform"
                                        onClick={() => navigate(`/novel/${novel.title.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '-').toLowerCase().slice(0, 24)}`, { state: { novel } })}
                                    >
                                        <div className="relative aspect-[2/3] w-full rounded-xl overflow-hidden shadow-lg border border-slate-100 dark:border-white/5">
                                            {novel.coverUrl ? (
                                                <img src={novel.coverUrl} className="absolute inset-0 w-full h-full object-cover" alt={novel.title} />
                                            ) : (
                                                <div className="absolute inset-0 bg-slate-300 dark:bg-[#2b2839] flex items-center justify-center">
                                                    <BookOpen className="text-4xl text-slate-400" />
                                                </div>
                                            )}
                                            <div className="absolute top-2 right-2 bg-emerald-500/90 backdrop-blur-sm shadow-lg text-white text-[8px] font-black px-2 py-0.5 rounded-lg uppercase tracking-tighter ring-1 ring-white/20">FINISH</div>
                                        </div>
                                        <div className="flex flex-col px-0.5">
                                            <p className="font-bold text-[13px] line-clamp-1 text-slate-900 dark:text-white leading-tight">{novel.title}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}





                </div>
            </div>

            <FooterNavigation />

            <CompletionModal
                isOpen={showSuccess}
                onClose={() => {
                    setShowSuccess(false);
                }}
                title="Sync Successful!"
                message="The discover page has been refreshed with the latest data."
            />

            {/* Sync Progress Modal */}
            {showSyncModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="bg-white dark:bg-[#1c1c1e] w-full max-w-sm rounded-[32px] p-8 shadow-2xl border border-slate-200 dark:border-white/10 flex flex-col items-center text-center scale-100 animate-in zoom-in-95 duration-300">
                        <div className="size-20 bg-primary/10 rounded-full flex items-center justify-center mb-6 relative">
                            <RefreshCcw size={32} className="text-primary animate-spin" />
                            <div className="absolute inset-0 border-4 border-primary/20 rounded-full"></div>
                        </div>
                        <h3 className="text-xl font-bold mb-2">Syncing Discover</h3>
                        <p className="text-slate-500 dark:text-[#a19db9] text-sm mb-6 leading-relaxed">
                            Updating all categories from NovelFire. This may take a few seconds.
                        </p>

                        <div className="w-full space-y-4">
                            <div className="flex justify-between items-center text-[10px] uppercase tracking-widest font-bold text-primary">
                                <span>{syncProgress.task}</span>
                                <span>{syncProgress.current}/{syncProgress.total}</span>
                            </div>
                            <div className="h-2 w-full bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-primary transition-all duration-500 rounded-full shadow-[0_0_12px_rgba(93,88,240,0.5)]"
                                    style={{ width: `${(syncProgress.current / syncProgress.total) * 100}%` }}
                                ></div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
