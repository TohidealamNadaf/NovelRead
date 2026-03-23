import { memo } from 'react';
import { BookOpen, RefreshCcw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface ManhwaDiscoverSectionProps {
    manhwaData: any;
    isLoadingManhwa: boolean;
    loadManhwaData: () => void;
    isSearchingManhwa?: boolean;
    searchPerformed?: boolean;
    manhwaSearchResults?: any[];
    searchQuery?: string;
    onClearSearch?: () => void;
    manhwaSearchSource?: 'mangadex' | 'asura';
    setManhwaSearchSource?: (source: 'mangadex' | 'asura') => void;
}

export const ManhwaDiscoverSection = memo(({
    manhwaData,
    isLoadingManhwa,
    loadManhwaData,
    isSearchingManhwa,
    searchPerformed,
    manhwaSearchResults,
    searchQuery,
    onClearSearch,
    manhwaSearchSource,
    setManhwaSearchSource
}: ManhwaDiscoverSectionProps) => {
    const navigate = useNavigate();

    const handleManhwaClick = (manga: any) => {
        if (manga.sourceUrl) {
            navigate(`/manhwa/${encodeURIComponent(manga.sourceUrl)}`);
        }
    };

    return (
        <>
            {/* MANHWA SEARCH RESULTS VIEW */}
            {searchPerformed && (
                <div className="flex flex-col gap-4 px-4 py-2 animate-in fade-in">
                    <div className="flex items-center justify-between">
                        <h3 className="text-lg font-bold tracking-tight">Search Results</h3>
                        {setManhwaSearchSource && (
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setManhwaSearchSource('mangadex')}
                                    className={`text-[10px] font-bold px-3 py-1 rounded-full border transition-colors ${
                                        manhwaSearchSource === 'mangadex'
                                            ? "bg-primary text-white border-primary"
                                            : "bg-transparent text-slate-500 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                                    }`}
                                >
                                    MangaDex
                                </button>
                                <button
                                    onClick={() => setManhwaSearchSource('asura')}
                                    className={`text-[10px] font-bold px-3 py-1 rounded-full border transition-colors ${
                                        manhwaSearchSource === 'asura'
                                            ? "bg-primary text-white border-primary"
                                            : "bg-transparent text-slate-500 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                                    }`}
                                >
                                    Asura Scans
                                </button>
                            </div>
                        )}
                    </div>

                    {isSearchingManhwa ? (
                        <div className="flex flex-col items-center justify-center py-20 opacity-50">
                            <RefreshCcw className="animate-spin mb-3 text-primary" size={28} />
                            <p className="text-sm font-medium">Searching Manhwas...</p>
                        </div>
                    ) : (
                        <>
                            {manhwaSearchResults && manhwaSearchResults.length > 0 ? (
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                    {manhwaSearchResults.map((result: any, idx: number) => (
                                        <div
                                            key={idx}
                                            className="flex flex-col gap-2 cursor-pointer active:scale-95 transition-transform"
                                            onClick={() => handleManhwaClick(result)}
                                        >
                                            <div className="aspect-[2/3] w-full rounded-xl overflow-hidden shadow-lg border border-slate-100 dark:border-white/5 relative bg-slate-200 dark:bg-[#1d1c27]">
                                                {result.coverUrl ? (
                                                    <img
                                                        src={result.coverUrl}
                                                        className="absolute inset-0 w-full h-full object-cover"
                                                        alt={result.title}
                                                        loading="lazy"
                                                    />
                                                ) : (
                                                    <div className="absolute inset-0 flex items-center justify-center text-slate-400">
                                                        <BookOpen size={32} />
                                                    </div>
                                                )}
                                            </div>
                                            <div>
                                                <p className="font-bold text-xs line-clamp-2 text-slate-900 dark:text-white leading-tight">{result.title}</p>
                                                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">{result.author || manhwaSearchSource}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                                    <BookOpen className="text-slate-300 dark:text-slate-700 mb-3" size={48} />
                                    <p className="text-slate-500 font-medium">No results found for "{searchQuery}"</p>
                                    <button
                                        onClick={onClearSearch}
                                        className="mt-4 text-primary text-sm font-bold bg-primary/10 px-4 py-2 rounded-lg"
                                    >
                                        Clear Search
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}

            {/* MANHWA DISCOVERY VIEW (Hidden when searching) */}
            {!searchPerformed && isLoadingManhwa && !manhwaData && (
                <div className="flex flex-col items-center justify-center py-10 opacity-50">
                    <RefreshCcw className="animate-spin mb-2" size={24} />
                    <p className="text-sm font-medium">Fetching Asura Scans content...</p>
                </div>
            )}

            {!searchPerformed && !isLoadingManhwa && (!manhwaData || (manhwaData.trending?.length === 0 && manhwaData.popular?.length === 0)) && (
                <div className="px-6 py-10 text-center">
                    <RefreshCcw className="mx-auto mb-4 text-primary opacity-50" size={32} />
                    <p className="text-slate-500 dark:text-[#a19db9] mb-4">No discovery data available for Asura Scans right now.</p>
                    <button
                        onClick={loadManhwaData}
                        className="bg-primary text-white px-6 py-2 rounded-xl font-bold"
                    >
                        Try Refresh
                    </button>
                </div>
            )}

            {/* Manhwa Trending */}
            {!searchPerformed && manhwaData?.trending && manhwaData.trending.length > 0 && (
                <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between px-4">
                        <h3 className="text-lg font-bold tracking-tight">Trending Manhwa</h3>
                    </div>
                    <div className="carousel-container flex overflow-x-auto gap-4 px-4 hide-scrollbar snap-x snap-mandatory">
                        {manhwaData.trending.map((manga: any, idx: number) => (
                            <div
                                key={idx}
                                className="carousel-item flex-none w-[85%] aspect-[16/9] relative rounded-2xl overflow-hidden shadow-xl snap-center shrink-0 cursor-pointer active:scale-[0.98] transition-transform"
                                onClick={() => handleManhwaClick(manga)}
                            >
                                <div className="absolute inset-0 bg-cover bg-center bg-slate-300 dark:bg-[#2b2839]" style={{ backgroundImage: `url('${manga.coverUrl}')` }}></div>
                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>
                                <div className="absolute bottom-4 left-4 right-4 text-left">
                                    <span className="bg-primary/90 backdrop-blur-sm text-white text-[10px] font-bold px-2.5 py-1 rounded-lg uppercase tracking-wider mb-2 inline-block">TRENDING</span>
                                    <h4 className="text-white text-xl font-bold leading-tight line-clamp-1">{manga.title}</h4>
                                    <p className="text-white/70 text-sm line-clamp-1">{manga.status || 'Ongoing'}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Popular Today */}
            {!searchPerformed && manhwaData?.popular && manhwaData.popular.length > 0 && (
                <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between px-4">
                        <h3 className="text-lg font-bold tracking-tight">Popular Today</h3>
                    </div>
                    <div className="flex overflow-x-auto gap-4 px-4 hide-scrollbar">
                        {manhwaData.popular.map((manga: any, idx: number) => (
                            <div
                                key={idx}
                                className="flex-none w-32 flex flex-col gap-2 cursor-pointer active:scale-95 transition-transform"
                                onClick={() => handleManhwaClick(manga)}
                            >
                                <div className="relative aspect-[2/3] w-full rounded-xl overflow-hidden shadow-lg border border-slate-100 dark:border-white/5">
                                    {manga.coverUrl ? (
                                        <>
                                            <img
                                                src={manga.coverUrl}
                                                className="absolute inset-0 w-full h-full object-cover"
                                                alt={manga.title}
                                                loading={idx < 4 ? "eager" : "lazy"}
                                                decoding="async"
                                                onError={(e) => {
                                                    (e.target as HTMLImageElement).style.display = 'none';
                                                    (e.target as HTMLImageElement).parentElement!.querySelector('.img-fallback')?.classList.remove('hidden');
                                                }}
                                            />
                                            <div className="img-fallback hidden absolute inset-0 bg-slate-300 dark:bg-[#2b2839] flex items-center justify-center">
                                                <BookOpen className="text-4xl text-slate-400" />
                                            </div>
                                        </>
                                    ) : (
                                        <div className="absolute inset-0 bg-slate-300 dark:bg-[#2b2839] flex items-center justify-center">
                                            <BookOpen className="text-4xl text-slate-400" />
                                        </div>
                                    )}
                                </div>
                                <div className="flex flex-col px-0.5 text-left">
                                    <p className="font-bold text-[13px] line-clamp-2 text-slate-900 dark:text-white leading-tight">{manga.title}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Latest Updates (Manhwa) */}
            {!searchPerformed && manhwaData?.latest && manhwaData.latest.length > 0 && (
                <div className="flex flex-col gap-3 pb-4">
                    <div className="flex items-center justify-between px-4">
                        <h3 className="text-lg font-bold tracking-tight">Latest Updates</h3>
                        <button
                            onClick={() => navigate('/discover/latest?mode=manhwa')}
                            className="text-primary text-sm font-medium"
                        >
                            See all
                        </button>
                    </div>
                    <div className="flex flex-col bg-white dark:bg-transparent rounded-2xl border border-slate-200 dark:border-white/5 overflow-hidden mx-4">
                        {manhwaData.latest.map((manga: any, idx: number) => (
                            <div
                                key={idx}
                                className="flex gap-4 p-4 border-b border-slate-100 dark:border-white/5 last:border-0 hover:bg-slate-50/50 dark:hover:bg-white/5 active:bg-slate-100 dark:active:bg-white/10 transition-colors cursor-pointer"
                                onClick={() => handleManhwaClick(manga)}
                            >
                                <div className="aspect-[2/3] w-14 shrink-0 rounded-lg overflow-hidden shadow-md border border-slate-100 dark:border-white/10">
                                    {manga.coverUrl ? (
                                        <>
                                            <img
                                                src={manga.coverUrl}
                                                className="w-full h-full object-cover"
                                                alt={manga.title}
                                                loading={idx < 4 ? "eager" : "lazy"}
                                                decoding="async"
                                                onError={(e) => {
                                                    (e.target as HTMLImageElement).style.display = 'none';
                                                    (e.target as HTMLImageElement).parentElement!.querySelector('.img-fallback')?.classList.remove('hidden');
                                                }}
                                            />
                                            <div className="img-fallback hidden w-full h-full bg-slate-200 dark:bg-[#2b2839] flex items-center justify-center text-slate-400">
                                                <BookOpen size={20} />
                                            </div>
                                        </>
                                    ) : (
                                        <div className="w-full h-full bg-slate-200 dark:bg-[#2b2839] flex items-center justify-center text-slate-400">
                                            <BookOpen size={20} />
                                        </div>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0 flex flex-col justify-center">
                                    <h4 className="font-bold text-[15px] truncate text-slate-900 dark:text-white mb-1.5 leading-tight">{manga.title}</h4>
                                    <div className="flex flex-col gap-0.5">
                                        <p className="text-[11px] text-slate-500 dark:text-[#a19db9] font-medium line-clamp-1">
                                            {manga.sourceUrl.includes('comic') ? 'Asura Scans' : 'Manhwa'}
                                        </p>
                                        <p className="text-[11px] text-primary font-bold">
                                            Latest Release
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </>
    );
});
