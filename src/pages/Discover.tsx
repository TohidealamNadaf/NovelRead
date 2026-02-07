import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Search, Bolt, BookOpen, Rocket, Heart, Swords, Filter, RefreshCcw } from 'lucide-react';
import { scraperService } from '../services/scraper.service';
import { dbService } from '../services/database.service';
import { Navbar } from '../components/Navbar';
import { CompletionModal } from '../components/CompletionModal';

export const Discover = () => {
    const navigate = useNavigate();
    const [searchQuery, setSearchQuery] = useState('');
    const [isScraping, setIsScraping] = useState(false);
    const [recentScrapes, setRecentScrapes] = useState<any[]>([]);
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [lastNovelTitle, setLastNovelTitle] = useState('');
    const [homeData, setHomeData] = useState<any>(null);
    const [isSyncingHome, setIsSyncingHome] = useState(false);
    const [shouldRedirect, setShouldRedirect] = useState(false);

    useEffect(() => {
        loadRecentScrapes();
        loadHomeData();
    }, []);

    const loadHomeData = async () => {
        const stored = localStorage.getItem('homeData');
        if (stored) {
            setHomeData(JSON.parse(stored));
        } else {
            syncHomeData();
        }
    };

    const syncHomeData = async () => {
        setIsSyncingHome(true);
        try {
            console.log("Syncing home data...");
            const data = await scraperService.fetchHomeData();
            console.log("Fetched home data:", data);

            const hasData = data && (
                data.recommended.length > 0 ||
                data.ranking.length > 0 ||
                data.latest.length > 0 ||
                data.completed?.length > 0
            );

            if (hasData) {
                setHomeData(data);
                localStorage.setItem('homeData', JSON.stringify(data));
                setShouldRedirect(false);
                setShowSuccess(true);
                setLastNovelTitle('Home Data Synced');
            } else {
                console.warn("Sync returned empty data structure:", data);
                alert("No dynamic novels found on NovelFire. The site might be experiencing high traffic or protection. Please try again in a moment.");
            }
        } catch (e) {
            console.error("Failed to sync home data", e);
            alert("Error syncing data: " + (e instanceof Error ? e.message : String(e)));
        } finally {
            setIsSyncingHome(false);
        }
    };

    const loadRecentScrapes = async () => {
        try {
            console.log("Initializing database for Discover...");
            await dbService.initialize();
            const novels = await dbService.getNovels();
            setRecentScrapes(novels.slice(0, 5));
        } catch (e) {
            console.error("Failed to load recent scrapes", e);
            setRecentScrapes([]);
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
            setIsScraping(true);
            try {
                const novel = await scraperService.fetchNovel(url);
                const novelId = novel.title.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '-').toLowerCase().slice(0, 32) + '-' + Date.now().toString(36);
                await dbService.initialize();
                await dbService.addNovel({
                    id: novelId,
                    title: novel.title,
                    author: novel.author,
                    coverUrl: novel.coverUrl,
                    sourceUrl: url,
                    category: 'Imported'
                });

                const chaptersToSave = novel.chapters.slice(0, 50);
                for (let i = 0; i < chaptersToSave.length; i++) {
                    const ch = chaptersToSave[i];
                    let content = '';

                    // Scrape first 5 chapters immediately for better UX
                    if (i < 5) {
                        try {
                            content = await scraperService.fetchChapterContent(ch.url);
                        } catch (e) {
                            console.error(`Failed to scrape chapter ${i + 1} during quick import`, e);
                        }
                    }

                    await dbService.addChapter({
                        id: `${novelId}-ch-${i + 1}`,
                        novelId: novelId,
                        title: ch.title,
                        content: content,
                        orderIndex: i,
                        audioPath: ch.url
                    });
                }
                setLastNovelTitle(novel.title);
                setShouldRedirect(true);
                setShowSuccess(true);
                loadRecentScrapes(); // Refresh list
            } catch (e) {
                console.error(e);
                alert("Quick scrape failed");
            } finally {
                setIsScraping(false);
            }
        }
    };

    return (
        <div className="h-screen w-full flex flex-col bg-background-light dark:bg-background-dark font-sans selection:bg-primary/30 overflow-hidden">
            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto pb-24">
                {/* Header */}
                <div className="sticky top-0 z-20 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md pt-[14px]">
                    <div className="flex items-center p-4 pb-2 justify-between">
                        <Link to="/profile" className="flex size-10 shrink-0 items-center overflow-hidden rounded-full ring-2 ring-primary/20 transition-transform active:scale-95">
                            <div className="bg-center bg-no-repeat aspect-square bg-cover size-full" style={{ backgroundImage: 'url("https://lh3.googleusercontent.com/aida-public/AB6AXuDjCOham51YfTM7PcgkgKspU9PvDHuom_3rGeCzHDOnhZnOzp09BhpYTuEnobo9LY8vOsfLsujPy9_QEMQ7WaQQSrFMdLgnji7T5irQ-C7DSmSq-0RKsDtEHLdFk2Jd7O9Qpw1VCPG_71gSZCD9ROyRef4a9hy1bzxv5Kmeyh5eiAx9wKqIXAtSkLrqYxyMQFSb2RIi6syEVabDEHarMZ8ece6wHlOJW3ky5o3LtKvE3JC2EZaJpRlwT5R61uO6G-mUqtqV5qNjIYyE")' }}></div>
                        </Link>
                        <h2 className="text-xl font-bold leading-tight tracking-tight flex-1 text-center">Discover</h2>
                        <div className="flex w-20 items-center justify-end gap-1 relative">
                            <button
                                onClick={syncHomeData}
                                disabled={isSyncingHome}
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
                                <div className="absolute top-full right-0 mt-2 w-48 bg-white dark:bg-[#1c1c1e] rounded-xl shadow-xl border border-slate-200 dark:border-white/10 py-2 z-50 animate-in fade-in zoom-in-95 duration-200">
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
                    </div>
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
                                    disabled={isScraping}
                                />
                                {isScraping && (
                                    <div className="flex items-center pr-3">
                                        <div className="size-4 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
                                    </div>
                                )}
                            </div>
                        </label>
                    </div>
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

                    {/* Trending Carousel (Recommended) */}
                    {homeData?.recommended?.length > 0 && (
                        <div className="flex flex-col gap-3">
                            <div className="flex items-center justify-between px-4">
                                <h3 className="text-lg font-bold tracking-tight">Recommended</h3>
                                <button onClick={() => navigate('/discover/recommended')} className="text-primary text-sm font-medium">See all</button>
                            </div>
                            <div className="carousel-container flex overflow-x-auto gap-4 px-4 hide-scrollbar snap-x snap-mandatory">
                                {homeData.recommended.slice(0, 5).map((novel: any, idx: number) => (
                                    <div
                                        key={idx}
                                        className="carousel-item flex-none w-[85%] aspect-[16/9] relative rounded-2xl overflow-hidden shadow-xl snap-center shrink-0 cursor-pointer active:scale-[0.98] transition-transform"
                                        onClick={() => navigate(`/novel/${novel.title.replace(/\s+/g, '-').toLowerCase()}`, { state: { novel } })}
                                    >
                                        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url('${novel.coverUrl}')` }}></div>
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>
                                        <div className="absolute bottom-4 left-4 right-4">
                                            <span className="bg-primary text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider mb-2 inline-block">Recommended</span>
                                            <h4 className="text-white text-xl font-bold leading-tight line-clamp-1">{novel.title}</h4>
                                            <p className="text-white/70 text-sm line-clamp-1">Read the latest on Novelfire</p>
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
                                {homeData.ranking.map((novel: any, idx: number) => (
                                    <div
                                        key={idx}
                                        className="flex-none w-32 flex flex-col gap-2 cursor-pointer active:scale-95 transition-transform"
                                        onClick={() => navigate(`/novel/${novel.title.replace(/\s+/g, '-').toLowerCase()}`, { state: { novel } })}
                                    >
                                        <div className="relative aspect-[2/3] w-full rounded-lg overflow-hidden shadow-md">
                                            <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url('${novel.coverUrl}')` }}></div>
                                            <div className="absolute top-1 left-1 bg-black/60 backdrop-blur-sm text-white size-6 flex items-center justify-center rounded-md font-bold text-[10px]">
                                                #{idx + 1}
                                            </div>
                                        </div>
                                        <div className="flex flex-col px-0.5">
                                            <p className="font-semibold text-[13px] line-clamp-2">{novel.title}</p>
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
                                {homeData.latest.slice(0, 5).map((novel: any, idx: number) => (
                                    <div
                                        key={idx}
                                        className="flex items-center gap-3 bg-slate-100 dark:bg-slate-900/40 p-2 rounded-xl active:bg-slate-200 dark:active:bg-slate-800 transition-colors cursor-pointer"
                                        onClick={() => navigate(`/novel/${novel.title.replace(/\s+/g, '-').toLowerCase()}`, { state: { novel } })}
                                    >
                                        <div className="size-16 rounded-lg overflow-hidden shrink-0 bg-cover bg-center" style={{ backgroundImage: `url('${novel.coverUrl}')` }}></div>
                                        <div className="flex-1 min-w-0">
                                            <h4 className="font-bold text-sm truncate">{novel.title}</h4>
                                            <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{novel.summary || 'Recently updated on Novelfire'}</p>
                                        </div>
                                        <div className="pr-2">
                                            <Bolt size={16} className="text-primary" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Completed Stories (New) */}
                    {homeData?.completed?.length > 0 && (
                        <div className="flex flex-col gap-3">
                            <div className="flex items-center justify-between px-4">
                                <h3 className="text-lg font-bold tracking-tight">Completed Stories</h3>
                                <button onClick={() => navigate('/discover/completed')} className="text-primary text-sm font-medium">See all</button>
                            </div>
                            <div className="flex overflow-x-auto gap-4 px-4 hide-scrollbar">
                                {homeData.completed.map((novel: any, idx: number) => (
                                    <div
                                        key={idx}
                                        className="flex-none w-32 flex flex-col gap-2 cursor-pointer active:scale-95 transition-transform"
                                        onClick={() => navigate(`/novel/${novel.title.replace(/\s+/g, '-').toLowerCase()}`, { state: { novel } })}
                                    >
                                        <div className="relative aspect-[2/3] w-full rounded-lg overflow-hidden shadow-md">
                                            <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url('${novel.coverUrl}')` }}></div>
                                            <div className="absolute top-2 right-2 bg-emerald-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded uppercase tracking-tighter">Done</div>
                                        </div>
                                        <div className="flex flex-col px-0.5">
                                            <p className="font-semibold text-[13px] line-clamp-1">{novel.title}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Genres */}
                    <div className="flex flex-col gap-3 mb-4">
                        <div className="flex items-center justify-between px-4">
                            <h3 className="text-lg font-bold tracking-tight">Top Genres</h3>
                        </div>
                        <div className="flex overflow-x-auto gap-3 px-4 hide-scrollbar">
                            <div className="flex-none w-32 h-20 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-800 flex flex-col items-center justify-center shadow-lg active:scale-95 transition-transform cursor-pointer" onClick={() => navigate('/discover/fantasy')}>
                                <BookOpen className="text-white mb-1" />
                                <span className="text-white text-xs font-bold">Fantasy</span>
                            </div>
                            <div className="flex-none w-32 h-20 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-800 flex flex-col items-center justify-center shadow-lg active:scale-95 transition-transform cursor-pointer" onClick={() => navigate('/discover/sci-fi')}>
                                <Rocket className="text-white mb-1" />
                                <span className="text-white text-xs font-bold">Sci-Fi</span>
                            </div>
                            <div className="flex-none w-32 h-20 rounded-xl bg-gradient-to-br from-rose-600 to-pink-800 flex flex-col items-center justify-center shadow-lg active:scale-95 transition-transform cursor-pointer" onClick={() => navigate('/discover/romance')}>
                                <Heart className="text-white mb-1" />
                                <span className="text-white text-xs font-bold">Romance</span>
                            </div>
                            <div className="flex-none w-32 h-20 rounded-xl bg-gradient-to-br from-amber-600 to-orange-800 flex flex-col items-center justify-center shadow-lg active:scale-95 transition-transform cursor-pointer" onClick={() => navigate('/discover/action')}>
                                <Swords className="text-white mb-1" />
                                <span className="text-white text-xs font-bold">Action</span>
                            </div>
                        </div>
                    </div>

                    {/* Recent Library */}
                    {recentScrapes.length > 0 && (
                        <div className="flex flex-col gap-3 py-4">
                            <div className="flex items-center justify-between px-4">
                                <h3 className="text-lg font-bold tracking-tight">From Your Library</h3>
                            </div>
                            <div className="flex overflow-x-auto gap-4 px-4 hide-scrollbar">
                                {recentScrapes.map((novel) => (
                                    <div key={novel.id} className="flex-none w-32 flex flex-col gap-2 cursor-pointer transition-transform active:scale-95" onClick={() => navigate(`/novel/${novel.id}`)}>
                                        <div className="relative aspect-[2/3] w-full rounded-lg overflow-hidden shadow-md">
                                            {novel.coverUrl ? (
                                                <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url('${novel.coverUrl}')` }}></div>
                                            ) : (
                                                <div className="absolute inset-0 bg-slate-300 dark:bg-[#2b2839] flex items-center justify-center">
                                                    <BookOpen className="text-4xl text-slate-400" />
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex flex-col px-0.5">
                                            <p className="font-semibold text-[13px] line-clamp-1">{novel.title}</p>
                                            <p className="text-slate-500 dark:text-[#a19db9] text-[10px] font-medium truncate">{novel.author || 'Unknown'}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                </div>
            </div>

            <Navbar />

            <CompletionModal
                isOpen={showSuccess}
                onClose={() => {
                    setShowSuccess(false);
                    if (shouldRedirect) navigate('/');
                }}
                title={shouldRedirect ? "Quick Scrape Success!" : "Sync Successful!"}
                message={shouldRedirect
                    ? `Successfully added "${lastNovelTitle}" to your library.`
                    : "Home page content has been updated."}
            />
        </div>
    );
};
