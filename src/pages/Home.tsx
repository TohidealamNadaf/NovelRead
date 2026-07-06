import { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from 'react';
import { FooterNavigation } from '../components/FooterNavigation';
import { Header } from '../components/Header';
import { dbService, type Novel } from '../services/db.service';
import { Link, useLocation } from 'react-router-dom';
import { Search, Bell, X, Clock, Play, ArrowUp } from 'lucide-react';
import { notificationService } from '../services/notification.service';
import { useProfileImage } from '../hooks/useProfileImage';
import { motion, AnimatePresence, useMotionValueEvent } from 'framer-motion';
import { useQuickReturnHeader } from '../hooks/useQuickReturnHeader';
import { NovelGrid } from '../components/NovelGrid';

// Custom hook for responsive grid columns
function useResponsiveColumns() {
    const [columns, setColumns] = useState(3);

    useEffect(() => {
        const updateCols = () => {
            const w = window.innerWidth;
            if (w < 380) setColumns(3); // Small phones
            else if (w < 600) setColumns(4); // Large phones
            else if (w < 800) setColumns(5); // Tablets
            else setColumns(6); // Desktops/Large Tablets
        };
        updateCols();
        window.addEventListener('resize', updateCols);
        return () => window.removeEventListener('resize', updateCols);
    }, []);

    return columns;
}

export const Home = () => {
    const [novels, setNovels] = useState<Novel[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [editMode, setEditMode] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [isScrolled, setIsScrolled] = useState(false);
    const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false);
    // FIX 2: We only measure the base header row's height once on mount (and resize).
    // The total height is computed analytically rather than firing continuously 
    // during the search-bar's spring animation, which saves numerous React re-renders.
    const headerRowRef = useRef<HTMLDivElement>(null);
    const [baseHeaderHeight, setBaseHeaderHeight] = useState(0);

    useLayoutEffect(() => {
        const measureBase = () => {
            if (headerRowRef.current) {
                setBaseHeaderHeight(headerRowRef.current.getBoundingClientRect().height);
            }
        };
        measureBase();
        window.addEventListener('resize', measureBase);
        return () => window.removeEventListener('resize', measureBase);
    }, []);

    const SEARCH_BLOCK_HEIGHT = 118;
    const isSearchExpanded = !editMode && !isHeaderCollapsed;
    const totalHeaderHeight = baseHeaderHeight + (isSearchExpanded ? SEARCH_BLOCK_HEIGHT : 0);

    const [showScrollTop, setShowScrollTop] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const location = useLocation();

    const COLUMN_COUNT = useResponsiveColumns();
    
    // FIX: Pass the precise dynamic `totalHeaderHeight` as the threshold.
    // If the header hides at the default 50px threshold while being 160px tall,
    // it will reveal 110px of completely empty space, causing a visible gap.
    // By tying the threshold exactly to the header's true rendered height, 
    // it is guaranteed that 160px of real content has already scrolled up behind it
    // *before* it slides away, ensuring a seamless reveal.
    const { hidden: isHeaderHidden, scrollY } = useQuickReturnHeader(containerRef, totalHeaderHeight);

    useMotionValueEvent(scrollY, "change", (latest) => {
        if (!sessionStorageTimeoutRef.current) {
            sessionStorageTimeoutRef.current = setTimeout(() => {
                sessionStorage.setItem('homeScroll', scrollY.get().toString());
                sessionStorageTimeoutRef.current = null;
            }, 150);
        }

        const targetShowScrollTop = latest > 500;
        setShowScrollTop(prev => prev !== targetShowScrollTop ? targetShowScrollTop : prev);

        const targetScrolled = latest > 10;
        setIsScrolled(prev => prev !== targetScrolled ? targetScrolled : prev);
        
        setIsHeaderCollapsed(prev => {
            if (latest > 80) return true;
            if (latest < 15) return false;
            return prev;
        });
    });

    // Long Press Edit Mode Tracking
    const pressTimer = useRef<NodeJS.Timeout | null>(null);
    const wasLongPressed = useRef(false);
    const sessionStorageTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Clean up scroll debounce timeout on unmount
    useEffect(() => {
        return () => {
            if (sessionStorageTimeoutRef.current) {
                clearTimeout(sessionStorageTimeoutRef.current);
            }
        };
    }, []);

    const handlePointerDown = useCallback(() => {
        if (editMode) return;
        wasLongPressed.current = false;
        pressTimer.current = setTimeout(() => {
            wasLongPressed.current = true;
            setEditMode(true);
            if (navigator.vibrate) navigator.vibrate(50);
        }, 800); // Shorter long press for better UX
    }, [editMode]);

    const handlePointerUpOrMove = useCallback(() => {
        if (pressTimer.current) {
            clearTimeout(pressTimer.current);
            pressTimer.current = null;
        }
    }, []);

    const preventLinkIfEdit = useCallback((e: React.MouseEvent) => {
        if (wasLongPressed.current || editMode) {
            e.preventDefault();
        }
    }, [editMode]);

    // Scroll restoration
    useEffect(() => {
        const savedScroll = sessionStorage.getItem('homeScroll');
        if (savedScroll && containerRef.current) {
            containerRef.current.scrollTop = parseInt(savedScroll, 10);
        }
    }, [novels]);

    useEffect(() => {
        loadLibrary();
        const unsubscribe = notificationService.subscribe(() => {
            setUnreadCount(notificationService.getUnreadCount());
        });
        return unsubscribe;
    }, [location]);

    const loadLibrary = async () => {
        try {
            await dbService.initialize();
            const data = await dbService.getNovels();
            setNovels(data);
        } catch (error) {
            console.error("Failed to load library", error);
            notificationService.addNotification({ title: 'Error', body: 'Failed to load library data', type: 'system' });
            setNovels([]);
        }
    };



    const handleSearchIconClick = () => {
        containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
        setIsHeaderCollapsed(false);
        setTimeout(() => {
            const input = document.getElementById('library-search-input');
            if (input) {
                input.focus();
            }
        }, 300);
    };

    const scrollToTop = () => {
        containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleDeleteNovel = useCallback(async (novelId: string, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (confirm('Are you sure you want to delete this novel? All chapters and progress will be removed.')) {
            try {
                await dbService.deleteNovel(novelId);
                setNovels(prev => prev.filter(n => n.id !== novelId));
                if (novels.length <= 1) setEditMode(false);
            } catch (error) {
                console.error('Failed to delete novel:', error);
            }
        }
    }, [novels.length]);

    // Filter Logic
    const filteredNovels = useMemo(() => {
        return novels.filter(novel => {
            const matchesSearch = novel.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (novel.author && novel.author.toLowerCase().includes(searchQuery.toLowerCase()));
            const matchesCategory = selectedCategory === 'All' || novel.category === selectedCategory;
            return matchesSearch && matchesCategory;
        });
    }, [novels, searchQuery, selectedCategory]);

    // Categories
    const categories = useMemo(() => {
        const cats = new Set(novels.map(n => n.category || 'Unknown'));
        return ['All', ...Array.from(cats).sort()];
    }, [novels]);

    // Continue Reading 
    const continueReading = useMemo(() => {
        return novels
            .filter(n => n.lastReadChapterId && n.lastReadAt)
            .sort((a, b) => (b.lastReadAt || 0) - (a.lastReadAt || 0));
    }, [novels]);

    const heroNovel = continueReading.length > 0 ? continueReading[0] : null;
    const recentCarousel = continueReading.length > 1 ? continueReading.slice(1, 6) : [];

    const profileImage = useProfileImage();



    return (
        <div className="relative h-screen w-full flex flex-col bg-background-light dark:bg-[#0f111a] overflow-hidden font-sans">
            {/* Main Content Area */}
            <div
                ref={containerRef}
                className="flex-1 overflow-y-auto overflow-x-hidden touch-pan-y relative pb-24 hide-scrollbar"
            >
                {/* 
                    Static height = max possible header size (never animates).
                    Previously this animated `height` directly, which is a layout property —
                    every frame of the spring forced a reflow of the hero banner, carousel,
                    and grid below it, compounding with scroll-driven paint/composite work
                    and causing visible stutter right at the collapse threshold.
                    Now the spacer never changes size; the visual "collapse" is achieved by
                    translating the content below it instead (see the wrapping motion.div below),
                    which is a compositor-only operation.
                */}
                <div 
                    className="shrink-0 w-full"
                    style={{ height: baseHeaderHeight + SEARCH_BLOCK_HEIGHT }}
                />

                {/* Header Section - Sticky Frosted Glass */}
                <motion.div 
                    variants={{
                        visible: { y: 0 },
                        hidden: { y: "-100%" },
                    }}
                    animate={isHeaderHidden ? "hidden" : "visible"}
                    transition={{ duration: 0.35, ease: "easeInOut" }}
                    className="fixed top-0 inset-x-0 z-30"
                >
                    <div 
                        className="absolute inset-0 bg-white/80 dark:bg-[#0f111a]/80 backdrop-blur-xl shadow-sm transition-opacity duration-300 pointer-events-none"
                        style={{ opacity: isScrolled ? 1 : 0 }}
                    />
                    
                    <div className="relative z-10">
                        <div ref={headerRowRef}>
                            <Header
                                title="Library"
                            autoElevate={false}
                            leftContent={
                                <Link to="/profile" className="flex size-10 shrink-0 items-center overflow-hidden rounded-full ring-2 ring-primary/20 transition-transform active:scale-95">
                                    <div className="bg-center bg-no-repeat aspect-square bg-cover size-full" style={{ backgroundImage: `url("${profileImage || 'https://img.freepik.com/free-psd/3d-illustration-person-with-sunglasses_23-2149436188.jpg'}")` }}></div>
                                </Link>
                            }
                            rightActions={
                                <div className="flex items-center gap-1">
                                    <AnimatePresence>
                                        {isHeaderCollapsed && !editMode && (
                                            <motion.button
                                                initial={{ opacity: 0, scale: 0.6, width: 0 }}
                                                animate={{ opacity: 1, scale: 1, width: 'auto' }}
                                                exit={{ opacity: 0, scale: 0.6, width: 0 }}
                                                onClick={handleSearchIconClick}
                                                className="flex items-center justify-center p-2.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors overflow-hidden shrink-0"
                                            >
                                                <Search size={22} className="text-slate-700 dark:text-white" />
                                            </motion.button>
                                        )}
                                    </AnimatePresence>
                                    {novels.length > 0 && (
                                        <button
                                            onClick={() => setEditMode(!editMode)}
                                            className={`text-sm font-bold px-4 py-2 rounded-full transition-all active:scale-95 ${editMode ? 'bg-red-500 text-white shadow-lg shadow-red-500/30' : 'text-primary hover:bg-primary/10'}`}
                                        >
                                            {editMode ? 'Done' : 'Edit'}
                                        </button>
                                    )}
                                    <Link to="/notifications" className="flex items-center justify-center p-2.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors relative active:scale-95">
                                        <Bell size={22} className="text-slate-700 dark:text-white" />
                                        {unreadCount > 0 && (
                                            <motion.span 
                                                initial={{ scale: 0 }} animate={{ scale: 1 }}
                                                className="absolute top-1 right-1 size-4.5 bg-primary text-white text-[10px] font-bold flex items-center justify-center rounded-full ring-2 ring-white dark:ring-[#0f111a]"
                                            >
                                                {unreadCount}
                                            </motion.span>
                                        )}
                                    </Link>
                                </div>
                            }
                            transparent
                        />
                        </div>

                        {/* Search & Categories (Hidden in Edit Mode or when Collapsed) */}
                        <motion.div 
                            initial={false}
                            animate={{ 
                                opacity: (editMode || isHeaderCollapsed) ? 0 : 1, 
                                height: (editMode || isHeaderCollapsed) ? 0 : 118,
                                pointerEvents: (editMode || isHeaderCollapsed) ? 'none' : 'auto'
                            }}
                            transition={{ type: "spring", stiffness: 220, damping: 28 }}
                            className="overflow-hidden"
                        >
                            {/* Search Bar */}
                            <div className="px-4 py-2">
                                <div className="flex w-full items-center rounded-2xl bg-slate-100/80 dark:bg-white/5 border border-transparent focus-within:border-primary/50 focus-within:bg-white dark:focus-within:bg-white/10 focus-within:shadow-sm transition-all duration-300">
                                    <div className="pl-4 text-slate-400">
                                        <Search size={18} />
                                    </div>
                                    <input
                                        id="library-search-input"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="flex-1 bg-transparent border-none py-3 px-3 text-[15px] focus:outline-none placeholder:text-slate-400 dark:text-slate-200"
                                        placeholder="Search your collection..."
                                    />
                                    {searchQuery && (
                                        <button onClick={() => setSearchQuery('')} className="pr-4 text-slate-400 hover:text-slate-600 transition-colors">
                                            <X size={18} />
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Categories */}
                            <div className="flex gap-2 px-4 pb-3 overflow-x-auto hide-scrollbar">
                                {categories.map((cat) => (
                                    <button
                                        key={cat}
                                        onClick={() => setSelectedCategory(cat)}
                                        className={`flex h-9 shrink-0 items-center justify-center rounded-full px-5 text-sm font-semibold transition-all active:scale-95 ${selectedCategory === cat
                                            ? 'bg-primary text-white shadow-lg shadow-primary/30 scale-105'
                                            : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10'
                                            }`}
                                    >
                                        {cat}
                                    </button>
                                ))}
                            </div>
                        </motion.div>
                    </div>
                </motion.div>

            {/* Main Content Area */}
            <motion.div 
                initial={false}
                animate={{ y: isSearchExpanded ? 0 : -SEARCH_BLOCK_HEIGHT }}
                transition={{ type: "spring", stiffness: 220, damping: 28 }}
                className="pt-2"
                style={{ willChange: 'transform' }}
            >
                    {/* Hero Banner for Continue Reading */}
                    {!searchQuery && selectedCategory === 'All' && heroNovel && !editMode && (
                        <motion.div 
                            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                            className="px-4 mb-8"
                        >
                            <h3 className="text-xl font-extrabold mb-4 flex items-center gap-2 text-slate-800 dark:text-white">
                                Jump Back In
                            </h3>
                            <Link
                                to={heroNovel.category === 'Manhwa' ? `/manhwa/${encodeURIComponent(heroNovel.id)}` : `/novel/${encodeURIComponent(heroNovel.id)}`}
                                className="relative flex w-full rounded-3xl overflow-hidden shadow-2xl shadow-primary/10 active:scale-[0.98] transition-transform duration-300 group min-h-[160px]"
                            >
                                {/* Blurred Background Cover */}
                                <div className="absolute inset-0 z-0">
                                    <img 
                                        src={heroNovel.coverUrl || '/placeholder-cover.jpg'} 
                                        alt="" 
                                        className="size-full object-cover blur-md scale-110 opacity-40 dark:opacity-30 group-hover:scale-125 transition-transform duration-700"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-r from-background-light via-background-light/90 to-background-light/40 dark:from-[#0f111a] dark:via-[#0f111a]/90 dark:to-[#0f111a]/40" />
                                </div>

                                {/* Content */}
                                <div className="relative z-10 flex w-full p-4 items-center gap-4">
                                    <div className="w-24 shrink-0 rounded-xl overflow-hidden shadow-lg ring-1 ring-white/20">
                                        <div className="aspect-[2/3] relative">
                                            <img src={heroNovel.coverUrl || '/placeholder-cover.jpg'} alt={heroNovel.title} className="size-full object-cover" />
                                            <div className="absolute bottom-0 inset-x-0 h-1 bg-black/50">
                                                <div className="h-full bg-primary shadow-[0_0_8px_rgba(var(--color-primary),0.8)]" style={{ width: `${Math.min(100, ((heroNovel.readChapters || 0) / (heroNovel.totalChapters || 1)) * 100)}%` }} />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex-1 flex flex-col justify-center py-2">
                                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/10 text-primary w-max mb-2">
                                            <Clock size={12} strokeWidth={3} />
                                            <span className="text-[10px] font-bold uppercase tracking-wider">Continue</span>
                                        </div>
                                        <h4 className="text-base sm:text-lg font-bold line-clamp-2 leading-tight mb-1">{heroNovel.title}</h4>
                                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Chapter {heroNovel.readChapters || 0} of {heroNovel.totalChapters || '?'}</p>
                                        
                                        <div className="flex items-center gap-2 mt-auto">
                                            <div className="flex items-center justify-center size-8 rounded-full bg-primary text-white shadow-md shadow-primary/30 group-hover:bg-primary/90 transition-colors">
                                                <Play size={14} fill="currentColor" className="ml-0.5" />
                                            </div>
                                            <span className="text-sm font-semibold text-primary">Resume</span>
                                        </div>
                                    </div>
                                </div>
                            </Link>
                        </motion.div>
                    )}

                    {/* Recent Carousel */}
                    {!searchQuery && selectedCategory === 'All' && recentCarousel.length > 0 && !editMode && (
                        <div className="mb-8 relative">
                            <h3 className="text-lg font-bold mb-4 px-4 text-slate-800 dark:text-white">Recent Reads</h3>
                            {/* Edge Fading Masks */}
                            <div className="absolute left-0 top-10 bottom-0 w-4 bg-gradient-to-r from-background-light dark:from-[#0f111a] to-transparent z-10 pointer-events-none" />
                            <div className="absolute right-0 top-10 bottom-0 w-8 bg-gradient-to-l from-background-light dark:from-[#0f111a] to-transparent z-10 pointer-events-none" />
                            
                            <div className="flex gap-4 overflow-x-auto hide-scrollbar px-4 pb-4 snap-x scroll-px-4">
                                {recentCarousel.map(novel => (
                                    <Link
                                        key={'recent-' + novel.id}
                                        to={novel.category === 'Manhwa' ? `/manhwa/${encodeURIComponent(novel.id)}` : `/novel/${encodeURIComponent(novel.id)}`}
                                        className="snap-start shrink-0 w-[100px] sm:w-[120px] flex flex-col gap-2 group active:scale-95 transition-transform"
                                    >
                                        <div className="relative aspect-[2/3] w-full rounded-xl overflow-hidden shadow-md ring-1 ring-black/5 dark:ring-white/10 group-hover:shadow-lg transition-shadow">
                                            <img
                                                src={novel.coverUrl || '/placeholder-cover.jpg'}
                                                alt={novel.title}
                                                className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-110"
                                                loading="lazy"
                                            />
                                            <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                                            <div className="absolute bottom-2 inset-x-2">
                                                <div className="h-1 bg-white/20 rounded-full overflow-hidden backdrop-blur-md">
                                                    <div
                                                        className="h-full bg-primary"
                                                        style={{ width: `${Math.min(100, ((novel.readChapters || 0) / (novel.totalChapters || 1)) * 100)}%` }}
                                                     />
                                                </div>
                                            </div>
                                        </div>
                                        <p className="text-[11px] sm:text-xs font-semibold line-clamp-2 leading-tight group-hover:text-primary transition-colors">{novel.title}</p>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Main Collection Grid */}
                    <NovelGrid
                        filteredNovels={filteredNovels}
                        searchQuery={searchQuery}
                        selectedCategory={selectedCategory}
                        editMode={editMode}
                        COLUMN_COUNT={COLUMN_COUNT}
                        handlePointerDown={handlePointerDown}
                        handlePointerUpOrMove={handlePointerUpOrMove}
                        preventLinkIfEdit={preventLinkIfEdit}
                        handleDeleteNovel={handleDeleteNovel}
                    />
                </motion.div>
            </div>

            {/* Scroll to Top Button */}
            <AnimatePresence>
                {showScrollTop && (
                    <motion.button
                        initial={{ opacity: 0, y: 20, scale: 0.8 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 20, scale: 0.8 }}
                        onClick={scrollToTop}
                        className="absolute bottom-24 right-6 z-40 p-3.5 bg-primary text-white rounded-full shadow-xl shadow-primary/30 hover:bg-primary/90 active:scale-90 transition-all"
                        aria-label="Scroll to top"
                    >
                        <ArrowUp size={24} />
                    </motion.button>
                )}
            </AnimatePresence>

            <div className="z-50 relative">
                <FooterNavigation />
            </div>
        </div >
    );
};
