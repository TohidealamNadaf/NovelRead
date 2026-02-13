import { memo } from 'react';
import { BookOpen, RefreshCcw, Search, X, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { generateSlug } from '../../utils/slugUtils';
import type { NovelMetadata } from '../../services/scraper.service';

interface NovelDiscoverSectionProps {
    homeData: any;
    isSearchingNovels: boolean;
    searchPerformed: boolean;
    novelSearchResults: NovelMetadata[];
    searchQuery: string;
    onClearSearch: () => void;
}

export const NovelDiscoverSection = memo(({
    homeData,
    isSearchingNovels,
    searchPerformed,
    novelSearchResults,
    searchQuery,
    onClearSearch
}: NovelDiscoverSectionProps) => {
    const navigate = useNavigate();

    const goToNovel = (novel: any) => {
        navigate(`/novel/live-${generateSlug(novel.title || 'novel')}`, { state: { liveMode: true, novel } });
    };

    return (
        <>
            {/* Novel Search Results */}
            {(isSearchingNovels || searchPerformed) && (
                <div className="flex flex-col gap-3 px-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-lg font-bold tracking-tight">Search Results</h3>
                        <button
                            onClick={onClearSearch}
                            className="p-1.5 rounded-full hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
                        >
                            <X size={18} className="text-slate-400" />
                        </button>
                    </div>

                    {isSearchingNovels && (
                        <div className="flex items-center justify-center py-12 gap-3">
                            <Loader2 className="w-6 h-6 animate-spin text-primary" />
                            <p className="text-sm text-slate-400">Searching NovelFire...</p>
                        </div>
                    )}

                    {!isSearchingNovels && novelSearchResults.length === 0 && searchPerformed && (
                        <div className="flex flex-col items-center justify-center py-12 opacity-60">
                            <Search size={32} className="text-slate-300 dark:text-slate-600 mb-2" />
                            <p className="text-sm text-slate-500">No novels found for "{searchQuery}"</p>
                        </div>
                    )}

                    {!isSearchingNovels && novelSearchResults.length > 0 && (
                        <div className="flex flex-col gap-3">
                            {novelSearchResults.map((novel: any, idx: number) => (
                                <div
                                    key={idx}
                                    className="flex gap-3 p-3 rounded-xl bg-slate-100/60 dark:bg-transparent border border-slate-200/60 dark:border-white/5 cursor-pointer active:scale-[0.98] transition-transform"
                                    onClick={() => goToNovel(novel)}
                                >
                                    <div className="w-16 h-22 shrink-0 rounded-lg overflow-hidden shadow-md">
                                        {novel.coverUrl ? (
                                            <img
                                                src={novel.coverUrl}
                                                className="w-full h-full object-cover"
                                                alt={novel.title}
                                                loading={idx < 4 ? "eager" : "lazy"}
                                                decoding="async"
                                            />
                                        ) : (
                                            <div className="w-full h-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center">
                                                <BookOpen size={20} className="text-slate-400" />
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1 flex flex-col justify-center min-w-0">
                                        <p className="font-bold text-sm text-slate-900 dark:text-white line-clamp-2 leading-tight">{novel.title}</p>
                                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{novel.author && novel.author !== 'Unknown' ? novel.author : novel.chapters?.length ? `${novel.chapters.length} Chapters` : 'Novel'}</p>
                                        {novel.status && (
                                            <span className="text-[10px] text-primary font-bold mt-1">{novel.status}</span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Recommended - if empty show nothing or skeleton */}
            {!homeData && !searchPerformed && (
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
                                onClick={() => goToNovel(novel)}
                            >
                                <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url('${novel.coverUrl}')` }}></div>
                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>
                                <div className="absolute bottom-4 left-4 right-4">
                                    <span className="bg-primary/90 backdrop-blur-sm text-white text-[10px] font-bold px-2.5 py-1 rounded-lg uppercase tracking-wider mb-2 inline-block">Recommended</span>
                                    <h4 className="text-white text-xl font-bold leading-tight line-clamp-1">{novel.title}</h4>
                                    <p className="text-white/70 text-sm line-clamp-1">{novel.author && novel.author !== 'Unknown' ? novel.author : novel.chapters?.length ? `${novel.chapters.length} Chapters` : 'Best of NovelFire'}</p>
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
                                onClick={() => goToNovel(novel)}
                            >
                                <div className="relative aspect-[2/3] w-full rounded-xl overflow-hidden shadow-lg border border-slate-100 dark:border-white/5">
                                    {novel.coverUrl ? (
                                        <img
                                            src={novel.coverUrl}
                                            className="absolute inset-0 w-full h-full object-cover"
                                            alt={novel.title}
                                            loading={idx < 4 ? "eager" : "lazy"}
                                            decoding="async"
                                        />
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
                    <div className="flex flex-col bg-white dark:bg-transparent rounded-2xl border border-slate-200 dark:border-white/5 overflow-hidden mx-4">
                        {homeData.latest.slice(0, 10).map((novel: any, idx: number) => (
                            <div
                                key={idx}
                                className="flex gap-4 p-4 border-b border-slate-100 dark:border-white/5 last:border-0 hover:bg-slate-50/50 dark:hover:bg-white/5 active:bg-slate-100 dark:active:bg-white/10 transition-colors cursor-pointer"
                                onClick={() => goToNovel(novel)}
                            >
                                <div className="aspect-[2/3] w-14 shrink-0 rounded-lg overflow-hidden shadow-md border border-slate-100 dark:border-white/10">
                                    {novel.coverUrl ? (
                                        <img
                                            src={novel.coverUrl}
                                            className="w-full h-full object-cover"
                                            alt={novel.title}
                                            loading={idx < 4 ? "eager" : "lazy"}
                                            decoding="async"
                                        />
                                    ) : (
                                        <div className="w-full h-full bg-slate-200 dark:bg-[#2b2839] flex items-center justify-center text-slate-400">
                                            <BookOpen size={20} />
                                        </div>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0 flex flex-col justify-center">
                                    <h4 className="font-bold text-[15px] truncate text-slate-900 dark:text-white mb-1.5 leading-tight">{novel.title}</h4>
                                    <div className="flex flex-col gap-0.5">
                                        <p className="text-[11px] text-slate-500 dark:text-[#a19db9] font-medium line-clamp-1">
                                            {novel.author && novel.author !== 'Unknown' ? novel.author : 'Novel'}
                                        </p>
                                        <p className="text-[11px] text-primary font-bold">
                                            {novel.chapters?.length ? `${novel.chapters.length} Chapters` : 'Recently Updated'}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Recently Added (from AJAX or Fallback) - Novel Only */}
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
                                onClick={() => goToNovel(novel)}
                            >
                                <div className="relative aspect-[2/3] w-full rounded-xl overflow-hidden shadow-sm border border-slate-100 dark:border-white/5">
                                    {novel.coverUrl ? (
                                        <img
                                            src={novel.coverUrl}
                                            className="absolute inset-0 w-full h-full object-cover"
                                            alt={novel.title}
                                            loading={idx < 4 ? "eager" : "lazy"}
                                            decoding="async"
                                        />
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

            {/* Completed Stories - Novel Only */}
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
                                onClick={() => goToNovel(novel)}
                            >
                                <div className="relative aspect-[2/3] w-full rounded-xl overflow-hidden shadow-lg border border-slate-100 dark:border-white/5">
                                    {novel.coverUrl ? (
                                        <img
                                            src={novel.coverUrl}
                                            className="absolute inset-0 w-full h-full object-cover"
                                            alt={novel.title}
                                            loading={idx < 4 ? "eager" : "lazy"}
                                            decoding="async"
                                        />
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
        </>
    );
});
