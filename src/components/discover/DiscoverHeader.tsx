import { memo } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCcw, Filter, Search } from 'lucide-react';
import { Header } from '../Header';

interface DiscoverHeaderProps {
    profileImage: string;
    isSyncingHome: boolean;
    isGlobalScraping: boolean;
    isFilterOpen: boolean;
    setIsFilterOpen: (isOpen: boolean) => void;
    syncHomeData: () => void;
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    handleSearch: (e: React.KeyboardEvent) => void;
    mode: 'novels' | 'manhwa';
    setMode: (mode: 'novels' | 'manhwa') => void;
    navigate: (path: string) => void;
}

export const DiscoverHeader = memo(({
    profileImage,
    isSyncingHome,
    isGlobalScraping,
    isFilterOpen,
    setIsFilterOpen,
    syncHomeData,
    searchQuery,
    setSearchQuery,
    handleSearch,
    mode,
    setMode,
    navigate
}: DiscoverHeaderProps) => {
    return (
        <div className="sticky top-0 z-20 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md">
            <Header
                title="Discover"
                transparent
                leftContent={
                    <Link to="/profile" className="flex size-10 shrink-0 items-center overflow-hidden rounded-full ring-2 ring-primary/20 transition-transform active:scale-95">
                        <div className="bg-center bg-no-repeat aspect-square bg-cover size-full" style={{ backgroundImage: `url("${profileImage || 'https://img.freepik.com/free-psd/3d-illustration-person-with-sunglasses_23-2149436188.jpg'}")` }}></div>
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

            <div className="px-4 py-3 pb-1">
                <label className="flex flex-col min-w-40 h-11 w-full">
                    <div className="flex w-full flex-1 items-stretch rounded-xl h-full bg-slate-200/50 dark:bg-[#2b2839]">
                        <div className="text-slate-500 dark:text-[#a19db9] flex items-center justify-center pl-4">
                            <Search size={20} />
                        </div>
                        <input
                            className="flex w-full min-w-0 flex-1 border-none bg-transparent focus:outline-0 focus:ring-0 text-base font-normal placeholder:text-slate-500 dark:placeholder:text-[#a19db9] px-3"
                            placeholder={mode === 'manhwa' ? "Search Asura/MangaDex..." : "Search titles or paste URL..."}
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

            {/* Tab Switcher */}
            <div className="px-4 py-2 flex gap-4">
                <button
                    onClick={() => setMode('novels')}
                    className={`px-4 py-1.5 rounded-full text-sm font-bold transition-all ${mode === 'novels' ? 'bg-primary text-white shadow-lg shadow-primary/30' : 'bg-slate-200/50 dark:bg-[#2b2839] text-slate-500 dark:text-[#a19db9]'}`}
                >
                    Novels
                </button>
                <button
                    onClick={() => setMode('manhwa')}
                    className={`px-4 py-1.5 rounded-full text-sm font-bold transition-all ${mode === 'manhwa' ? 'bg-primary text-white shadow-lg shadow-primary/30' : 'bg-slate-200/50 dark:bg-[#2b2839] text-slate-500 dark:text-[#a19db9]'}`}
                >
                    Manhwa
                </button>
            </div>
        </div>
    );
});
