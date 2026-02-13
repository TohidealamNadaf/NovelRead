import { memo } from 'react';
import { BookOpen, RefreshCcw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface ManhwaDiscoverSectionProps {
    manhwaData: any;
    isLoadingManhwa: boolean;
    loadManhwaData: () => void;
}

export const ManhwaDiscoverSection = memo(({
    manhwaData,
    isLoadingManhwa,
    loadManhwaData
}: ManhwaDiscoverSectionProps) => {
    const navigate = useNavigate();

    return (
        <>
            {/* MANHWA DISCOVERY VIEW */}
            {isLoadingManhwa && !manhwaData && (
                <div className="flex flex-col items-center justify-center py-10 opacity-50">
                    <RefreshCcw className="animate-spin mb-2" size={24} />
                    <p className="text-sm font-medium">Fetching Asura Scans content...</p>
                </div>
            )}

            {!isLoadingManhwa && (!manhwaData || (manhwaData.trending?.length === 0 && manhwaData.popular?.length === 0)) && (
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
            {manhwaData?.trending && manhwaData.trending.length > 0 && (
                <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between px-4">
                        <h3 className="text-lg font-bold tracking-tight">Trending Manhwa</h3>
                    </div>
                    <div className="carousel-container flex overflow-x-auto gap-4 px-4 hide-scrollbar snap-x snap-mandatory">
                        {manhwaData.trending.map((manga: any, idx: number) => (
                            <div
                                key={idx}
                                className="carousel-item flex-none w-[85%] aspect-[16/9] relative rounded-2xl overflow-hidden shadow-xl snap-center shrink-0 cursor-pointer active:scale-[0.98] transition-transform"
                                onClick={() => navigate('/import', { state: { initialUrl: manga.sourceUrl } })}
                            >
                                <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url('${manga.coverUrl}')` }}></div>
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
            {manhwaData?.popular && manhwaData.popular.length > 0 && (
                <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between px-4">
                        <h3 className="text-lg font-bold tracking-tight">Popular Today</h3>
                    </div>
                    <div className="flex overflow-x-auto gap-4 px-4 hide-scrollbar">
                        {manhwaData.popular.map((manga: any, idx: number) => (
                            <div
                                key={idx}
                                className="flex-none w-32 flex flex-col gap-2 cursor-pointer active:scale-95 transition-transform"
                                onClick={() => navigate('/import', { state: { initialUrl: manga.sourceUrl } })}
                            >
                                <div className="relative aspect-[2/3] w-full rounded-xl overflow-hidden shadow-lg border border-slate-100 dark:border-white/5">
                                    {manga.coverUrl ? (
                                        <img
                                            src={manga.coverUrl}
                                            className="absolute inset-0 w-full h-full object-cover"
                                            alt={manga.title}
                                            loading={idx < 4 ? "eager" : "lazy"}
                                            decoding="async"
                                        />
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
            {manhwaData?.latest && manhwaData.latest.length > 0 && (
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
                                onClick={() => navigate('/import', { state: { initialUrl: manga.sourceUrl } })}
                            >
                                <div className="aspect-[2/3] w-14 shrink-0 rounded-lg overflow-hidden shadow-md border border-slate-100 dark:border-white/10">
                                    {manga.coverUrl ? (
                                        <img
                                            src={manga.coverUrl}
                                            className="w-full h-full object-cover"
                                            alt={manga.title}
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
