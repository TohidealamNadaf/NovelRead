import { memo } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCcw, Filter, Search, X } from 'lucide-react';
import { Header } from '../Header';
import { motion, AnimatePresence } from 'framer-motion';

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
    mode: 'novelfire' | 'freewebnovel' | 'manhwa';
    setMode: (mode: 'novelfire' | 'freewebnovel' | 'manhwa') => void;
    navigate: (path: string) => void;
    isCollapsed: boolean;
    onSearchIconClick: () => void;
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
    navigate,
    isCollapsed,
    onSearchIconClick
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
                    <div className="flex items-center justify-end gap-1 relative">
                        <AnimatePresence>
                            {isCollapsed && (
                                <motion.button
                                    initial={{ opacity: 0, scale: 0.6, width: 0 }}
                                    animate={{ opacity: 1, scale: 1, width: 'auto' }}
                                    exit={{ opacity: 0, scale: 0.6, width: 0 }}
                                    onClick={onSearchIconClick}
                                    className="flex items-center justify-center p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors overflow-hidden shrink-0"
                                >
                                    <Search className="text-primary" size={20} />
                                </motion.button>
                            )}
                        </AnimatePresence>
                        <button
                            onClick={syncHomeData}
                            disabled={isGlobalScraping}
                            className={`flex items-center justify-center p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 active:scale-90 active:bg-primary/10 transition-all duration-200 ${isSyncingHome ? 'animate-spin opacity-50' : ''}`}
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

            <motion.div
                initial={false}
                animate={{
                    height: isCollapsed ? 0 : 60,
                    opacity: isCollapsed ? 0 : 1,
                    paddingTop: isCollapsed ? 0 : 8,
                    paddingBottom: isCollapsed ? 0 : 4,
                    pointerEvents: isCollapsed ? 'none' : 'auto'
                }}
                transition={{ type: "spring", stiffness: 220, damping: 28 }}
                className="overflow-hidden px-4"
            >
                <div className="flex w-full h-12 items-center rounded-2xl bg-slate-100 dark:bg-[#2b2839] border border-transparent focus-within:border-primary/50 focus-within:bg-white dark:focus-within:bg-[#1c1c1e] focus-within:shadow-sm transition-all duration-200">
                    <div className="text-slate-400 dark:text-[#a19db9] group-focus-within:text-primary transition-colors flex items-center justify-center pl-4">
                        <Search size={20} />
                    </div>
                    <input
                        className="flex w-full min-w-0 flex-1 border-none bg-transparent focus:outline-0 focus:ring-0 text-[15px] font-medium placeholder:text-slate-400 dark:placeholder:text-[#8a86a3] px-3 text-slate-900 dark:text-white"
                        placeholder={mode === 'manhwa' ? "Search Asura Scans..." : "Search titles or paste URL..."}
                        value={searchQuery}
                        id="search-input"
                        name="search-query"
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={handleSearch}
                        disabled={isGlobalScraping}
                    />
                    {searchQuery && !isGlobalScraping && (
                        <button
                            onClick={(e) => {
                                e.preventDefault();
                                setSearchQuery('');
                            }}
                            className="flex items-center justify-center pr-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                        >
                            <X size={18} />
                        </button>
                    )}
                    {isGlobalScraping && (
                        <div className="flex items-center pr-4">
                            <div className="size-4 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
                        </div>
                    )}
                </div>
            </motion.div>

            {/* Tab Switcher */}
            <motion.div
                initial={false}
                animate={{
                    height: isCollapsed ? 0 : 54,
                    opacity: isCollapsed ? 0 : 1,
                    paddingTop: isCollapsed ? 0 : 4,
                    paddingBottom: isCollapsed ? 0 : 8,
                    pointerEvents: isCollapsed ? 'none' : 'auto'
                }}
                transition={{ type: "spring", stiffness: 220, damping: 28 }}
                className="overflow-hidden px-4"
            >
                <div className="flex p-1 bg-slate-200/50 dark:bg-[#2b2839]/50 rounded-xl shadow-inner relative">
                    {['novelfire', 'freewebnovel', 'manhwa'].map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setMode(tab as any)}
                            className={`relative flex-1 py-1.5 rounded-lg text-[13px] sm:text-sm font-bold transition-colors duration-200 z-10 ${mode === tab ? 'text-white' : 'text-slate-500 dark:text-[#a19db9] hover:text-slate-700 dark:hover:text-slate-300'
                                }`}
                        >
                            {mode === tab && (
                                <motion.div
                                    layoutId="discoverActiveTab"
                                    className="absolute inset-0 bg-primary rounded-lg shadow-md shadow-primary/20"
                                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                    style={{ zIndex: -1 }}
                                />
                            )}
                            {tab === 'novelfire' ? 'NovelFire' : tab === 'freewebnovel' ? 'FWN' : 'Manhwa'}
                        </button>
                    ))}
                </div>
            </motion.div>
        </div>
    );
});
