import { useRef, useState, useCallback, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
    MoreHorizontal, Search, Filter, Download, CheckCircle,
    DownloadCloud, Trash2, Minimize2, Loader2, Save,
    BookmarkPlus, BookmarkCheck, ChevronDown, ChevronUp, WifiOff, BookOpen, ArrowUp
} from 'lucide-react';
import { Header } from '../components/Header';
import { Toast } from '../components/Toast';
import { ActionModal } from '../components/ActionModal';
import { ChapterRow } from '../components/ChapterRow';
import { useChapterData } from '../hooks/useChapterData';
import { useChapterActions } from '../hooks/useChapterActions';
import { useOfflineStatus } from '../hooks/useOfflineStatus';

export const ChapterList = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const parentRef = useRef<HTMLDivElement>(null);
    const [searchTerm, setSearchTerm] = useState('');

    // --- Hooks ---
    const { isOffline } = useOfflineStatus();
    const {
        novel,
        chapters,
        liveChapters,
        loading,
        loadingPage,
        addedToLibrary,
        setAddedToLibrary,
        isLiveMode,
        downloadedLiveChapters,
        setDownloadedLiveChapters,
        readLiveChapters,
        scrapingProgress,
        isGlobalScraping,
        filter,
        setFilter,
        setSearchQuery,
        sortOrder,
        setSortOrder,
        filteredChapters,
        // loadData, // Unused in this component (handled in hook)
        setChapters
    } = useChapterData();

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => {
            setSearchQuery(searchTerm);
        }, 300);
        return () => clearTimeout(timer);
    }, [searchTerm, setSearchQuery]);

    // UI State
    const [showMenu, setShowMenu] = useState(false);
    const [showFilterMenu, setShowFilterMenu] = useState(false);
    const [isSynopsisExpanded, setIsSynopsisExpanded] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'info' | 'success' | 'error' } | null>(null);
    const [modal, setModal] = useState<{ isOpen: boolean; title: string; message: string; onConfirm: () => void; type: 'danger' | 'primary' }>({
        isOpen: false, title: '', message: '', onConfirm: () => { }, type: 'primary'
    });

    const showToast = useCallback((message: string, type: 'info' | 'success' | 'error' = 'info') => {
        setToast({ message, type });
    }, []);

    const showModal = useCallback((title: string, message: string, onConfirm: () => void, type: 'danger' | 'primary' = 'primary') => {
        setModal({ isOpen: true, title, message, onConfirm, type });
    }, []);

    const {
        downloading,
        downloadingLive,
        isSyncing,
        isScrapingNew,
        handleDownload,
        handleLiveDownloadChapter,
        handleDownloadAll,
        triggerLiveDownloadAll,
        handleSync,
        handleDelete,
        handleAddToLibrary
    } = useChapterActions({
        novel,
        novelId: novel?.id,
        chapters,
        liveChapters,
        locationState: location.state,
        setChapters,
        setDownloadedLiveChapters,
        setAddedToLibrary,
        onShowToast: showToast,
        onShowModal: showModal
    });

    // --- Virtualizer ---
    const rowVirtualizer = useVirtualizer({
        count: filteredChapters.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 73,
        overscan: 8,
    });

    // --- Scroll Restoration ---
    useEffect(() => {
        if (!loading && parentRef.current && novel?.id) {
            const savedScroll = sessionStorage.getItem(`scroll-${novel.id}`);
            if (savedScroll) {
                parentRef.current.scrollTop = parseInt(savedScroll, 10);
            }
        }
    }, [loading, novel?.id]);

    const [showScrollTop, setShowScrollTop] = useState(false);

    const handleScroll = useCallback(() => {
        if (parentRef.current && novel?.id) {
            sessionStorage.setItem(`scroll-${novel.id}`, parentRef.current.scrollTop.toString());
            setShowScrollTop(parentRef.current.scrollTop > 400);
        }
    }, [novel?.id]);

    const scrollToTop = useCallback(() => {
        if (parentRef.current) {
            parentRef.current.scrollTop = 0;
        }
    }, []);

    // --- Handlers ---
    const handleChapterClick = useCallback((chapter: any) => {
        if (isLiveMode) {
            const realIndex = liveChapters.findIndex((c: any) =>
                (c.url && c.url === chapter.url)
            );
            navigate(`/read/live/${encodeURIComponent(chapter.url)}`, {
                state: {
                    liveMode: true,
                    chapterUrl: chapter.url,
                    chapterTitle: chapter.title,
                    novelTitle: novel?.title,
                    novelCoverUrl: novel?.coverUrl,
                    novelSourceUrl: novel?.sourceUrl,
                    currentIndex: realIndex !== -1 ? realIndex : 0,
                    chapters: [...liveChapters]
                }
            });
        } else {
            const realIndex = chapters.findIndex(c => c.id === chapter.id);
            navigate(`/read/${novel?.id}/${chapter.id}`, {
                state: {
                    novel,
                    liveMode: false,
                    currentIndex: realIndex !== -1 ? realIndex : 0,
                    chapters: [...chapters]
                }
            });
        }
    }, [isLiveMode, navigate, novel, liveChapters, chapters]);


    // --- Render Helpers ---
    if (loading) {
        return <div className="flex h-screen items-center justify-center dark:bg-background-dark"><Loader2 className="animate-spin text-primary" size={32} /></div>;
    }

    if (!novel) {
        return <div className="flex h-screen items-center justify-center dark:bg-background-dark"><p className="dark:text-white">Novel not found</p></div>;
    }

    // Determine total chapters count for display
    const totalChaptersData = isLiveMode ? liveChapters.length : chapters.length;

    return (
        <div className="h-screen w-full flex flex-col bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 font-sans overflow-hidden">
            <Header
                title={novel?.title || 'Chapter Index'}
                subtitle={novel?.author}
                showBack={true}
                className="bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md z-50 shrink-0"
                withBorder
                rightActions={
                    <div className="relative flex items-center gap-2">
                        {isOffline && <WifiOff className="text-slate-400" size={18} />}
                        <button className="p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors" onClick={() => setShowMenu(!showMenu)}>
                            <MoreHorizontal className="text-primary" />
                        </button>
                        {showMenu && (
                            <>
                                <div className="fixed inset-0 z-50" onClick={() => setShowMenu(false)}></div>
                                <div className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-100 dark:border-slate-800 z-[60] py-1 animate-in fade-in zoom-in-95 duration-200">
                                    <button
                                        className="w-full text-left px-4 py-3 text-sm font-medium hover:bg-slate-50 dark:hover:bg-white/5 flex items-center gap-2 border-b border-slate-100 dark:border-white/5 text-slate-700 dark:text-slate-200"
                                        onClick={() => {
                                            setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                                            setShowMenu(false);
                                        }}
                                    >
                                        <Filter size={16} />
                                        Sort: {sortOrder === 'asc' ? 'Newest First' : 'Oldest First'}
                                    </button>
                                    {isLiveMode ? (
                                        <button
                                            className={`w-full text-left px-4 py-3 text-sm font-medium flex items-center gap-2 ${addedToLibrary ? 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/10' : 'hover:bg-slate-50 dark:hover:bg-white/5 text-slate-700 dark:text-slate-200'}`}
                                            onClick={() => { handleAddToLibrary(); setShowMenu(false); }}
                                            disabled={addedToLibrary}
                                        >
                                            {addedToLibrary ? <BookmarkCheck size={16} /> : <BookmarkPlus size={16} />}
                                            {addedToLibrary ? 'Added to Library' : 'Add to Library'}
                                        </button>
                                    ) : (
                                        <>
                                            <button
                                                className="w-full text-left px-4 py-3 text-sm font-medium hover:bg-slate-50 dark:hover:bg-white/5 flex items-center gap-2 border-b border-slate-100 dark:border-white/5 text-slate-700 dark:text-slate-200"
                                                onClick={() => { handleSync(); setShowMenu(false); }}
                                                disabled={isSyncing}
                                            >
                                                <DownloadCloud size={16} className={isSyncing ? "animate-pulse" : ""} />
                                                {isSyncing ? "Syncing..." : "Sync Chapters"}
                                            </button>
                                            <button
                                                className="w-full text-left px-4 py-3 text-sm font-medium hover:bg-red-50 dark:hover:bg-red-950/20 flex items-center gap-2 text-red-600 dark:text-red-400"
                                                onClick={() => { handleDelete(); setShowMenu(false); }}
                                            >
                                                <Trash2 size={16} />
                                                Delete Novel
                                            </button>
                                        </>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                }
            />

            {/* Global Scraping Progress Bar */}
            {(isScrapingNew || isGlobalScraping) && (
                <div className="sticky top-[60px] z-40 bg-background-light dark:bg-background-dark px-4 pb-2 pt-2 animate-in slide-in-from-top-2 duration-300 border-b border-slate-200 dark:border-slate-800">
                    <div className="bg-primary/10 border border-primary/20 rounded-xl p-3">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <Loader2 size={16} className="text-primary animate-spin" />
                                <span className="text-[11px] font-bold text-primary uppercase tracking-wider line-clamp-1">
                                    {scrapingProgress.currentTitle}
                                </span>
                            </div>
                            <span className="text-[11px] font-bold text-primary whitespace-nowrap">
                                {scrapingProgress.current} / {scrapingProgress.total}
                            </span>
                        </div>
                        <div className="h-1.5 w-full bg-primary/20 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-primary transition-all duration-300"
                                style={{ width: `${(scrapingProgress.current / scrapingProgress.total) * 100}%` }}
                            ></div>
                        </div>
                        <div className="flex items-center gap-2 mt-2 opacity-70">
                            <Minimize2 size={12} className="text-primary" />
                            <span className="text-[10px] text-primary font-medium">Processing in background</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Single Scroll Container — novel info scrolls away, search bar sticks */}
            <main
                ref={parentRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto hide-scrollbar overscroll-y-contain"
            >
                {/* Novel Info Header (scrolls away naturally) */}
                <div className="p-4 bg-background-light dark:bg-background-dark">
                    <div className="flex gap-5">
                        {/* Cover Image */}
                        <div className="relative shrink-0">
                            <div className="bg-center bg-no-repeat aspect-[2/3] bg-cover rounded-lg shadow-xl w-28 bg-slate-800 border border-white/10"
                                style={{ backgroundImage: `url("${novel.coverUrl}")` }}>
                            </div>
                            <div className="absolute bottom-1 right-1 bg-primary text-[10px] text-white px-1.5 py-0.5 rounded font-sans uppercase tracking-wider font-bold">
                                {novel.source || 'WEB'}
                            </div>
                        </div>
                        {/* Title & Metadata */}
                        <div className="flex flex-col justify-center flex-1 min-w-0">
                            <h1 className="text-xl font-bold leading-tight mb-1 line-clamp-2">{novel.title}</h1>
                            <p className="text-slate-500 dark:text-slate-400 text-base mb-2 italic truncate">by {novel.author}</p>
                            <div className="flex flex-wrap gap-2 mb-3">
                                <span className="px-2 py-0.5 bg-green-500/10 text-green-500 text-xs rounded-full border border-green-500/20 font-sans">
                                    {novel.status || 'Ongoing'}
                                </span>
                                <span className="px-2 py-0.5 bg-primary/10 text-primary text-xs rounded-full border border-primary/20 font-sans">
                                    {(novel.totalChapters || 0) > 0 ? novel.totalChapters : totalChaptersData} Chapters
                                </span>
                                {isLiveMode && (
                                    <span className="px-2 py-0.5 bg-amber-500/10 text-amber-500 text-xs rounded-full border border-amber-500/20 font-sans">
                                        Live
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Summary */}
                    {novel.summary && (
                        <div className="mt-4 text-sm leading-relaxed text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-slate-800 transition-all duration-300">
                            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary mb-2">Synopsis</h3>
                            <p className={!isSynopsisExpanded ? "line-clamp-4" : ""}>
                                {novel.summary}
                            </p>
                            {novel.summary.length > 150 && (
                                <button
                                    onClick={() => setIsSynopsisExpanded(!isSynopsisExpanded)}
                                    className="mt-3 flex items-center gap-1.5 text-primary text-xs font-bold font-sans active:opacity-60 transition-opacity"
                                >
                                    {isSynopsisExpanded ? (
                                        <>Show Less <ChevronUp size={14} /></>
                                    ) : (
                                        <>Read More <ChevronDown size={14} /></>
                                    )}
                                </button>
                            )}
                        </div>
                    )}

                    {/* Reading Progress */}
                    {addedToLibrary && (
                        <div className="mt-3 p-3 rounded-xl bg-slate-100 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800">
                            <div className="flex justify-between items-center mb-1.5">
                                <p className="text-[10px] uppercase tracking-widest text-slate-500 dark:text-slate-400 font-sans font-bold">Reading Progress</p>
                                <span className="text-xs font-bold text-primary">
                                    {Math.round(((novel.readChapters || 0) / (novel.totalChapters || 1)) * 100)}%
                                </span>
                            </div>
                            <div className="h-2 w-full bg-slate-200 dark:bg-slate-700/50 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-primary transition-all duration-500 ease-out"
                                    style={{ width: `${Math.min(100, ((novel.readChapters || 0) / (novel.totalChapters || 1)) * 100)}%` }}
                                />
                            </div>
                            <div className="flex justify-between mt-1">
                                <span className="text-[10px] text-slate-400">{novel.readChapters || 0} Read</span>
                                <span className="text-[10px] text-slate-400">{novel.totalChapters || 0} Total</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Search/Filter Bar (Sticky — stays pinned as you scroll) */}
                <div className="px-4 py-2 flex flex-col gap-3 sticky top-0 z-30 bg-background-light dark:bg-background-dark border-b border-slate-200 dark:border-slate-800 shadow-sm">
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <input
                                className="w-full pl-10 pr-4 py-2 bg-slate-100 dark:bg-slate-900 border-none rounded-lg text-sm focus:ring-1 focus:ring-primary placeholder:text-slate-500 font-sans outline-none dark:text-white"
                                placeholder="Search chapter title..."
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <div className="relative">
                            <button
                                className={`flex items-center justify-center bg-slate-100 dark:bg-slate-900 px-3 h-full rounded-lg border-none hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors ${filter !== 'all' ? 'ring-2 ring-primary/50' : ''}`}
                                onClick={() => setShowFilterMenu(!showFilterMenu)}
                            >
                                <Filter className={filter !== 'all' ? "text-primary" : "text-slate-500"} size={20} />
                            </button>
                            {showFilterMenu && (
                                <>
                                    <div className="fixed inset-0 z-10" onClick={() => setShowFilterMenu(false)}></div>
                                    <div className="absolute right-0 top-full mt-2 w-40 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-100 dark:border-slate-800 z-20 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                                        {['all', 'unread', 'read', 'downloaded'].map((opt) => (
                                            <button
                                                key={opt}
                                                className={`w-full text-left px-4 py-2.5 text-sm font-medium hover:bg-slate-50 dark:hover:bg-white/5 flex items-center justify-between text-slate-700 dark:text-slate-200 ${filter === opt ? 'text-primary bg-primary/5' : ''}`}
                                                onClick={() => { setFilter(opt as any); setShowFilterMenu(false); }}
                                            >
                                                {opt.charAt(0).toUpperCase() + opt.slice(1)}
                                                {filter === opt && <CheckCircle size={14} />}
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center justify-between py-1 border-t border-slate-100 dark:border-slate-800/50">
                        <div className="flex items-center gap-2">
                            {isLiveMode ? <Save className="text-primary" size={20} /> : <CheckCircle className="text-primary" size={20} />}
                            <span className="text-xs font-sans font-medium text-slate-600 dark:text-slate-300">
                                {isLiveMode ? 'Import to Library' : 'Available offline'}
                            </span>
                        </div>
                        <button
                            className="text-xs font-sans font-bold text-primary hover:opacity-80 flex items-center gap-1"
                            onClick={() => {
                                if (isLiveMode) {
                                    const undownloaded = liveChapters.filter(ch => !downloadedLiveChapters.has(ch.url));
                                    triggerLiveDownloadAll(undownloaded);
                                } else {
                                    handleDownloadAll();
                                }
                            }}
                        >
                            <Download size={16} /> DOWNLOAD ALL
                        </button>
                    </div>
                </div>

                {/* Virtualized Chapter List */}
                <div
                    style={{
                        height: `${rowVirtualizer.getTotalSize()}px`,
                        width: '100%',
                        position: 'relative',
                    }}
                >
                    {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                        const chapter = filteredChapters[virtualRow.index];
                        if (!chapter) return null;

                        const isDownloaded = isLiveMode ? downloadedLiveChapters.has(chapter.url) : (chapter.content || chapter.contentPath);
                        const isRead = isLiveMode ? readLiveChapters.has(chapter.url) : (chapter.isRead || false);
                        const isDownloadingItem = isLiveMode ? downloadingLive.has(chapter.url) : downloading.has(chapter.id);
                        const displayIndex = sortOrder === 'asc'
                            ? (isLiveMode ? (chapter._index + 1) : (chapter.orderIndex + 1))
                            : (totalChaptersData - virtualRow.index);

                        return (
                            <div
                                key={virtualRow.key}
                                data-index={virtualRow.index}
                                ref={rowVirtualizer.measureElement}
                                style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    width: '100%',
                                    transform: `translateY(${virtualRow.start}px)`,
                                }}
                            >
                                <ChapterRow
                                    chapter={chapter}
                                    index={displayIndex}
                                    isLiveMode={isLiveMode}
                                    isDownloaded={Boolean(isDownloaded)}
                                    isDownloading={isDownloadingItem}
                                    isRead={!!isRead}
                                    onClick={() => handleChapterClick(chapter)}
                                    onDownload={(e) => {
                                        e?.stopPropagation();
                                        if (isLiveMode) {
                                            handleLiveDownloadChapter(chapter, chapter._index);
                                        } else {
                                            handleDownload(chapter);
                                        }
                                    }}
                                />
                            </div>
                        );
                    })}
                </div>
                {/* Bottom spacer for FAB clearance */}
                <div className="h-24" />

                {/* Live Loading Indicator */}
                {loadingPage > 0 && isLiveMode && (
                    <div className="flex items-center justify-center py-4 gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-primary" />
                        <span className="text-xs text-slate-400 dark:text-slate-500">Loading page {loadingPage + 1}...</span>
                    </div>
                )}

                {filteredChapters.length === 0 && !loading && (
                    <div className="p-8 text-center text-slate-500">No chapters found.</div>
                )}
            </main>

            {/* Scroll to Top Button */}
            {showScrollTop && (
                <button
                    onClick={scrollToTop}
                    className="fixed bottom-6 left-6 z-50 w-11 h-11 rounded-full bg-slate-800/80 dark:bg-slate-200/80 text-white dark:text-slate-900 shadow-lg backdrop-blur-sm flex items-center justify-center hover:scale-105 active:scale-95 transition-all duration-200"
                    style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
                >
                    <ArrowUp size={20} />
                </button>
            )}

            {/* Floating Action Button for Start/Continue Reading */}
            {(chapters.length > 0 || liveChapters.length > 0) && (
                <div className="fixed bottom-6 right-6 z-50" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
                    <button
                        onClick={() => {
                            // 1. Try to find in LOCAL DB (match ID or Audio/URL)
                            const foundChapter = chapters.find(c => c.id === novel.lastReadChapterId || c.audioPath === novel.lastReadChapterId);

                            // 2. Try to find in LIVE list (match URL or Derived ID)
                            const foundLive = liveChapters.find((c, idx) =>
                                c.url === novel.lastReadChapterId ||
                                `${novel.id}-ch-${idx}` === novel.lastReadChapterId
                            );

                            console.log('[ChapterList] foundChapter:', foundChapter?.id, 'foundLive:', foundLive?.url);

                            const lastReadValid = novel.lastReadChapterId && (!!foundChapter || !!foundLive);

                            if (lastReadValid) {
                                if (foundChapter) {
                                    // foundChapter is a local DB Chapter — always use `chapters` for navigation
                                    const realIndex = chapters.findIndex(c => c.id === foundChapter.id);

                                    navigate(`/read/${novel.id}/${foundChapter.id}`, {
                                        state: {
                                            novel,
                                            liveMode: isLiveMode,
                                            chapterUrl: foundChapter.audioPath,
                                            chapterTitle: foundChapter.title,
                                            currentIndex: realIndex !== -1 ? realIndex : 0,
                                            chapters: [...chapters]
                                        }
                                    });
                                } else if (foundLive) {
                                    const targetUrl = foundLive.url;
                                    const realIndex = liveChapters.findIndex((c: any) => c.url === foundLive.url);

                                    navigate(`/read/${novel.id}/${encodeURIComponent(targetUrl)}`, {
                                        state: {
                                            novel,
                                            liveMode: true,
                                            chapterUrl: targetUrl,
                                            chapterTitle: foundLive.title,
                                            currentIndex: realIndex !== -1 ? realIndex : 0,
                                            chapters: [...liveChapters]
                                        }
                                    });
                                } else {
                                    navigate(`/read/${novel.id}/${novel.lastReadChapterId}`, {
                                        state: {
                                            novel,
                                            liveMode: isLiveMode,
                                            chapters: [...(liveChapters.length > 0 ? liveChapters : chapters)]
                                        }
                                    });
                                }
                            } else if (chapters.length > 0) {
                                navigate(`/read/${novel.id}/${chapters[0].id}`, {
                                    state: {
                                        novel,
                                        liveMode: isLiveMode,
                                        chapters: [...(liveChapters.length > 0 ? liveChapters : chapters)]
                                    }
                                });
                            } else if (liveChapters.length > 0) {
                                navigate(`/read/${novel.id}/${encodeURIComponent(liveChapters[0].url)}`, {
                                    state: {
                                        novel,
                                        liveMode: true,
                                        chapters: [...liveChapters]
                                    }
                                });
                            }
                        }}
                        className="group flex items-center gap-2 bg-primary hover:bg-primary-dark text-white rounded-full px-6 py-4 shadow-xl shadow-primary/30 transition-all active:scale-95 hover:scale-105"
                    >
                        <BookOpen size={24} className={(novel.lastReadChapterId && chapters.some(c => c.id === novel.lastReadChapterId)) ? "" : "animate-pulse"} />
                        <span className="font-bold text-lg">
                            {(novel.lastReadChapterId && chapters.some(c => c.id === novel.lastReadChapterId)) ? 'Continue' : 'Start Reading'}
                        </span>
                    </button>
                </div>
            )}

            {/* Modals & Toasts */}
            {toast && (
                <Toast
                    message={toast.message}
                    type={toast.type}
                    onClose={() => setToast(null)}
                />
            )}
            <ActionModal
                isOpen={modal.isOpen}
                title={modal.title}
                message={modal.message}
                onConfirm={() => {
                    modal.onConfirm();
                    setModal(prev => ({ ...prev, isOpen: false }));
                }}
                onCancel={() => setModal(prev => ({ ...prev, isOpen: false }))}
                type={modal.type}
            />
        </div>
    );
};
