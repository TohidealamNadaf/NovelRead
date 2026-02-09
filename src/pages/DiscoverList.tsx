import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Search, Bolt, TrendingUp, BookOpen, RefreshCw } from 'lucide-react';
import { FooterNavigation } from '../components/FooterNavigation';
import { Header } from '../components/Header';
import { scraperService } from '../services/scraper.service';

export const DiscoverList = () => {
    const { category } = useParams<{ category: string }>();
    const navigate = useNavigate();
    const [title, setTitle] = useState('');
    const [novels, setNovels] = useState<any[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [rankingType, setRankingType] = useState<'overall' | 'ratings' | 'most-read' | 'most-review'>('overall');
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const isLoadingRef = useRef(false);

    useEffect(() => {
        if (isLoadingRef.current) return;
        setPage(1);
        setNovels([]); // Clear previous novels to show loading state cleanly
        loadCategoryData(1, rankingType);
    }, [category, rankingType]);

    const loadCategoryData = async (pageNum: number, rankType: any = 'overall') => {
        let pageTitle = 'Discover';
        let data: any[] = [];
        setIsLoading(true);

        const storedHomeData = localStorage.getItem('homeData');
        const homeData = storedHomeData ? JSON.parse(storedHomeData) : null;

        try {
            if (category === 'trending' || category === 'recommended') {
                pageTitle = category === 'trending' ? 'Trending Now' : 'Recommended';
                data = homeData?.recommended || [];
                setHasMore(false);
            } else if (category === 'ranking') {
                pageTitle = 'Top Ranking';
                const liveRanking = await scraperService.fetchRanking(rankType, pageNum);
                data = liveRanking;
                setHasMore(liveRanking.length >= 20);
            } else if (category === 'latest' || category === 'new') {
                pageTitle = 'Latest Novels';
                const liveLatest = await scraperService.fetchLatest(pageNum);
                data = liveLatest;
                setHasMore(liveLatest.length >= 20);
            } else if (category === 'completed') {
                pageTitle = 'Completed Stories';
                const liveCompleted = await scraperService.fetchCompleted(pageNum);
                data = liveCompleted.length > 0 ? liveCompleted : (pageNum === 1 ? homeData?.completed || [] : []);
                setHasMore(liveCompleted.length >= 20);
            } else if (category === 'recentlyAdded' || category === 'recently-added') {
                pageTitle = 'Recently Added';
                const liveRecentlyAdded = await scraperService.fetchRecentlyAdded(pageNum);
                data = liveRecentlyAdded.length > 0 ? liveRecentlyAdded : (pageNum === 1 ? homeData?.recentlyAdded || [] : []);
                setHasMore(liveRecentlyAdded.length >= 20);
            } else if (category) {
                pageTitle = category.charAt(0).toUpperCase() + category.slice(1);
                data = [];
                setHasMore(false);
            }
        } catch (e) {
            console.error("Fetch failed", e);
            data = [];
        } finally {
            setTitle(pageTitle);
            if (pageNum === 1) {
                setNovels(data);
            } else {
                // Standard pagination: Replace list to avoid memory issues and match strict page handling
                setNovels(data);
            }
            setIsLoading(false);
            isLoadingRef.current = false;
        }
    };

    const handlePageChange = (direction: 'next' | 'prev') => {
        const nextPage = direction === 'next' ? page + 1 : Math.max(1, page - 1);
        setPage(nextPage);
        loadCategoryData(nextPage, rankingType);
        // Scroll to top
        document.querySelector('.flex-1.overflow-y-auto')?.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const filteredNovels = novels.filter(n => n.title.toLowerCase().includes(searchQuery.toLowerCase()));

    // Audio State for Mini-Player (Mocking visual only as per user design, functional one is global)
    // Actually, user design shows a specific mini-player *above* the navbar.
    // We already have a global MiniPlayer component.
    // The user design might be requesting a specific look for this page or just showing the player exists.
    // I will replicate the "AI TTS Active" card from the design as a static marketing element or real player integration?
    // Design says: "AI TTS Active" with a specific book cover.
    // If global player is running, it shows up.
    // The design's player looks slightly different (embedded in bottom).
    // I'll stick to our Global MiniPlayer for consistency/functionality, but maybe style it similar if requested?
    // The user request says: "Implement that page with all its functionality".
    // I will implement the list view primarily.

    return (
        <div className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-white h-screen w-full flex flex-col font-display overflow-hidden">
            {/* Header - Fixed at top */}
            <div className="bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md z-40 shrink-0">
                <Header
                    title={title}
                    showBack
                    transparent
                />
                {/* Search Bar */}
                <div className="px-4 py-3">
                    <label className="flex flex-col min-w-40 h-11 w-full">
                        <div className="flex w-full flex-1 items-stretch rounded-xl h-full bg-slate-200/50 dark:bg-[#2b2839]">
                            <div className="text-slate-500 dark:text-[#a19db9] flex items-center justify-center pl-4">
                                <Search size={20} />
                            </div>
                            <input
                                className="form-input flex w-full min-w-0 flex-1 border-none bg-transparent focus:outline-0 focus:ring-0 text-base font-normal placeholder:text-slate-500 dark:placeholder:text-[#a19db9] px-3"
                                placeholder={`Search ${title.toLowerCase()}...`}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </label>
                </div>

                {/* Ranking Type Filters */}
                {category === 'ranking' && (
                    <div className="flex overflow-x-auto gap-2 px-4 pb-3 hide-scrollbar">
                        {[
                            { id: 'overall', label: 'Ranks' },
                            { id: 'ratings', label: 'Ratings' },
                            { id: 'most-read', label: 'Most Read' },
                            { id: 'most-review', label: 'Most Review' }
                        ].map(type => (
                            <button
                                key={type.id}
                                onClick={() => setRankingType(type.id as any)}
                                className={`flex-none px-4 py-1.5 rounded-full text-xs font-bold transition-all border ${rankingType === type.id
                                    ? 'bg-primary text-white border-primary shadow-lg shadow-primary/20'
                                    : 'bg-white dark:bg-[#1c1c1e] text-slate-500 border-slate-200 dark:border-white/5 active:bg-slate-50 dark:active:bg-white/5'
                                    }`}
                            >
                                {type.label}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Grid Content - Independent Scroll */}
            <div className="flex-1 overflow-y-auto px-4 pt-2 pb-32">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-20 opacity-50">
                        <RefreshCw size={40} className="animate-spin mb-4 text-primary" />
                        <p className="text-sm font-medium">Scraping live {title.toLowerCase()}...</p>
                    </div>
                ) : filteredNovels.length > 0 ? (
                    <div className="flex flex-col gap-6">
                        <div className="grid grid-cols-4 gap-x-3 gap-y-4">
                            {filteredNovels.map((novel, index) => (
                                <div key={index} className="flex flex-col gap-1.5 cursor-pointer active:scale-95 transition-transform" onClick={() => navigate(`/novel/${novel.title.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '-').toLowerCase().slice(0, 24)}`, { state: { novel } })}>
                                    <div className="relative aspect-[2/3] w-full rounded-lg overflow-hidden shadow-md border border-slate-100 dark:border-white/5 bg-slate-200 dark:bg-[#2b2839]">
                                        {novel.coverUrl ? (
                                            <img
                                                src={novel.coverUrl}
                                                className="absolute inset-0 w-full h-full object-cover"
                                                alt={novel.title}
                                                loading="eager"
                                                onError={(e) => {
                                                    const target = e.target as HTMLImageElement;
                                                    target.style.display = 'none';
                                                }}
                                            />
                                        ) : null}
                                        {/* Fallback icon shown when no image or while loading */}
                                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                            <BookOpen className="text-2xl text-slate-400 opacity-30" />
                                        </div>

                                        {/* Badges */}
                                        {novel.badge === 'bolt' && (
                                            <div className="absolute top-1 right-1 bg-black/60 backdrop-blur-sm text-white p-0.5 rounded">
                                                <Bolt size={12} fill="currentColor" />
                                            </div>
                                        )}
                                        {novel.badge === 'trending_up' && (
                                            <div className="absolute top-1 right-1 bg-primary/90 backdrop-blur-sm text-white p-0.5 rounded">
                                                <TrendingUp size={12} />
                                            </div>
                                        )}

                                        {category === 'ranking' && (
                                            <div className="absolute top-1 left-1 bg-black/60 backdrop-blur-sm text-white size-5 flex items-center justify-center rounded font-bold text-[8px]">
                                                #{(page - 1) * 24 + index + 1}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex flex-col">
                                        <p className="font-bold text-[11px] line-clamp-2 leading-tight">{novel.title}</p>
                                        <p className="text-slate-500 dark:text-[#a19db9] text-[9px] font-medium truncate">{novel.author || 'Unknown'}</p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Pagination Controls */}
                        {(category === 'ranking' || category === 'latest' || category === 'completed' || category === 'new' || category === 'recentlyAdded' || category === 'recently-added') && (
                            <div className="flex items-center justify-between pt-4 pb-8">
                                <button
                                    onClick={() => handlePageChange('prev')}
                                    disabled={page === 1 || isLoading}
                                    className="px-6 py-2.5 rounded-xl bg-white dark:bg-[#1c1c1e] text-sm font-bold border border-slate-200 dark:border-white/5 disabled:opacity-50 active:scale-95 transition-all"
                                >
                                    Previous
                                </button>
                                <span className="text-xs font-black uppercase tracking-widest text-primary">Page {page}</span>
                                <button
                                    onClick={() => handlePageChange('next')}
                                    disabled={!hasMore || isLoading}
                                    className="px-6 py-2.5 rounded-xl bg-primary text-white text-sm font-bold shadow-lg shadow-primary/20 disabled:opacity-50 active:scale-95 transition-all"
                                >
                                    Next Page
                                </button>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-20 opacity-50">
                        <BookOpen size={48} className="mb-4 text-slate-400" />
                        <p className="font-medium text-center text-sm px-10">No novels found in this category.</p>
                    </div>
                )}
            </div>

            {/* Navbar */}
            <FooterNavigation />
        </div>
    );
};
