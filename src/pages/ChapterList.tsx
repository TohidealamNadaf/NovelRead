import { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { dbService, type Novel, type Chapter } from '../services/db.service';
import { scraperService, type ScraperProgress, type NovelMetadata } from '../services/scraper.service';
import { CompletionModal } from '../components/CompletionModal';
import { MoreHorizontal, Search, Filter, Download, CheckCircle, DownloadCloud, PlayCircle, Trash2, Minimize2, Loader2, Save, BookmarkPlus, BookmarkCheck } from 'lucide-react';
import { Header } from '../components/Header';

export const ChapterList = () => {
    const { novelId } = useParams<{ novelId: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    const [showMenu, setShowMenu] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [filter, setFilter] = useState<'all' | 'read' | 'unread' | 'downloaded'>('all');
    const [showFilterMenu, setShowFilterMenu] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
    const [modalInfo, setModalInfo] = useState({ isOpen: false, title: '', message: '' });

    // Restore missing state variables
    const [novel, setNovel] = useState<Novel | null>(null);
    const [chapters, setChapters] = useState<Chapter[]>([]);
    const [loading, setLoading] = useState(true);
    const [downloading, setDownloading] = useState<Set<string>>(new Set());
    const [isScrapingNew, setIsScrapingNew] = useState(false);
    const [isPreviewMode, setIsPreviewMode] = useState(false);
    const [scrapingProgress, setScrapingProgress] = useState<ScraperProgress>(scraperService.progress);
    const [isGlobalScraping, setIsGlobalScraping] = useState(scraperService.isScraping);

    // Live browsing mode (detected from state or ID prefix)
    const isLiveMode = !!location.state?.liveMode || novelId?.startsWith('live-');
    const [liveChapters, setLiveChapters] = useState<{ title: string; url: string }[]>([]);
    const [loadingPage, setLoadingPage] = useState(0);
    const [downloadedLiveChapters, setDownloadedLiveChapters] = useState<Set<string>>(new Set());
    const [downloadingLive, setDownloadingLive] = useState<Set<string>>(new Set());
    const [addedToLibrary, setAddedToLibrary] = useState(false);

    const loadData = async () => {
        if (!novelId) return;

        // Live mode: fetch chapters from web
        if (isLiveMode) {
            let liveNovel = location.state?.novel as NovelMetadata;

            // If opened from library, fetch metadata from DB first to get sourceUrl
            if (!liveNovel && novelId) {
                try {
                    await dbService.initialize();
                    const dbNovel = await dbService.getNovel(novelId);
                    if (dbNovel) {
                        liveNovel = {
                            title: dbNovel.title,
                            author: dbNovel.author || 'Unknown',
                            coverUrl: dbNovel.coverUrl || '',
                            summary: dbNovel.summary || '',
                            status: dbNovel.status || 'Ongoing',
                            sourceUrl: dbNovel.sourceUrl || '',
                            chapters: []
                        } as any;
                    }
                } catch (e) {
                    console.error("Failed to load live novel from DB", e);
                }
            }

            if (liveNovel) {
                setNovel({
                    id: novelId || 'live-index',
                    title: liveNovel.title,
                    author: liveNovel.author || 'Unknown',
                    coverUrl: liveNovel.coverUrl || '',
                    summary: liveNovel.summary || '',
                    status: liveNovel.status || 'Ongoing',
                    sourceUrl: liveNovel.sourceUrl || '',
                    source: 'NovelFire',
                } as Novel);

                if (liveNovel.sourceUrl) {
                    try {
                        const data = await scraperService.fetchNovelFast(liveNovel.sourceUrl, (chaptersFound, page, metadata) => {
                            setLoadingPage(page);
                            setLiveChapters([...chaptersFound]);

                            if (metadata) {
                                setNovel(prev => prev ? {
                                    ...prev,
                                    title: metadata.title || prev.title,
                                    author: metadata.author || prev.author,
                                    coverUrl: metadata.coverUrl || prev.coverUrl,
                                    summary: metadata.summary || prev.summary,
                                    status: metadata.status || prev.status,
                                } : prev);
                                // Hide loader as soon as metadata/synopsis is available
                                if (loading) setLoading(false);
                            }

                            if (page === 1) setLoading(false);
                        });
                        if (data) {
                            setLiveChapters(data.chapters);
                            // Update novel metadata from fetched data
                            setNovel(prev => prev ? {
                                ...prev,
                                title: data.title || prev.title,
                                author: data.author || prev.author,
                                coverUrl: data.coverUrl || prev.coverUrl,
                                summary: data.summary || prev.summary,
                                status: data.status || prev.status,
                            } : prev);
                        }
                    } catch (e) {
                        console.error("Failed to fetch live chapters", e);
                    } finally {
                        setLoading(false);
                        setLoadingPage(0);
                    }
                } else {
                    setLoading(false);
                }
                return;
            }
        }

        // Standard DB mode
        try {
            await dbService.initialize();
            const n = await dbService.getNovel(novelId);
            if (n) {
                setNovel(n);
                const c = await dbService.getChapters(novelId);
                setChapters(c);
                setIsPreviewMode(false);
            } else if (location.state?.novel) {
                setNovel({
                    ...location.state.novel,
                    id: novelId,
                    summary: location.state.novel.summary || ''
                });
                setIsPreviewMode(true);
            }
        } catch (e) {
            console.error("Failed to load novel data", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const unsub = scraperService.subscribe((progress: ScraperProgress, isScraping: boolean) => {
            setScrapingProgress(progress);
            setIsGlobalScraping(isScraping);

            // If scraping finished and was for this novel, reload chapters
            if (!isScraping && progress.current > 0 && progress.current === progress.total) {
                loadData();
            }
        });

        loadData();
        return unsub;
    }, [novelId, location.state]);

    const handleInitialScrape = async () => {
        if (!novel?.sourceUrl) return;
        setIsScrapingNew(true);
        try {
            const scraped = await scraperService.fetchNovel(novel.sourceUrl);
            scraperService.startImport(novel.sourceUrl, scraped);
            // The subscription will handle UI updates
        } catch (e) {
            console.error("Scraping failed", e);
            alert("Failed to fetch novel details.");
        } finally {
            setIsScrapingNew(false);
        }
    };

    const handleDownload = async (chapter: any, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        if (downloading.has(chapter.id) || chapter.content) return;

        setDownloading(prev => new Set(prev).add(chapter.id));
        try {
            if (!chapter.content) {
                const content = await scraperService.fetchChapterContent(chapter.audioPath || '');
                await dbService.addChapter({
                    ...chapter,
                    content: content
                });

                setChapters(prev => prev.map(c => c.id === chapter.id ? { ...c, content } : c));
            }
        } catch (error) {
            console.error("Failed to download chapter", error);
            alert(`Failed to download ${chapter.title}`);
        } finally {
            setDownloading(prev => {
                const next = new Set(prev);
                next.delete(chapter.id);
                return next;
            });
        }
    };

    // === Live Mode Download Helpers ===

    // Generate a stable novel ID from the sourceUrl
    const getLiveNovelId = () => {
        const sourceUrl = novel?.sourceUrl || location.state?.novel?.sourceUrl || '';
        // Create a simple slug from the URL path
        const path = sourceUrl.replace(/https?:\/\/[^\/]+/, '').replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        return `live-${path}`.slice(0, 80);
    };

    // Ensure novel exists in DB before downloading chapters
    const ensureLiveNovelInDB = async () => {
        if (!novel) return '';
        const novelDbId = getLiveNovelId();
        await dbService.initialize();
        await dbService.addNovel({
            id: novelDbId,
            title: novel.title,
            author: novel.author || 'Unknown',
            coverUrl: novel.coverUrl || '',
            sourceUrl: novel.sourceUrl || '',
            summary: novel.summary || '',
            status: novel.status || 'Ongoing',
            source: 'NovelFire',
            category: 'Novel',
        } as any);
        return novelDbId;
    };

    // Download a single live chapter
    const handleLiveDownloadChapter = async (chapter: { title: string; url: string }, index: number, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        if (downloadingLive.has(chapter.url) || downloadedLiveChapters.has(chapter.url)) return;

        setDownloadingLive(prev => new Set(prev).add(chapter.url));
        try {
            const novelDbId = await ensureLiveNovelInDB();
            const content = await scraperService.fetchChapterContent(chapter.url);
            if (content && content.length > 50) {
                await dbService.addChapter({
                    id: `${novelDbId}-ch-${index}`,
                    novelId: novelDbId,
                    title: chapter.title,
                    content,
                    orderIndex: index,
                    audioPath: chapter.url,
                });
                setDownloadedLiveChapters(prev => new Set(prev).add(chapter.url));
            } else {
                alert(`Failed to download ${chapter.title}: Empty content`);
            }
        } catch (error) {
            console.error('Failed to download live chapter:', error);
            alert(`Failed to download ${chapter.title}`);
        } finally {
            setDownloadingLive(prev => {
                const next = new Set(prev);
                next.delete(chapter.url);
                return next;
            });
        }
    };

    // Download all live chapters in background
    const handleLiveDownloadAll = async () => {
        if (!novel || liveChapters.length === 0) return;
        const undownloaded = liveChapters.filter(ch => !downloadedLiveChapters.has(ch.url));
        if (undownloaded.length === 0) {
            alert('All chapters are already downloaded!');
            return;
        }

        if (!confirm(`Import ${undownloaded.length} chapters to your library for offline reading?`)) return;

        try {
            const novelDbId = await ensureLiveNovelInDB();
            scraperService.downloadAll(novelDbId, novel.title, undownloaded.map((ch) => ({
                title: ch.title,
                url: ch.url,
                audioPath: ch.url,
            })));
        } catch (error) {
            console.error('Failed to start download all:', error);
            alert('Failed to start download.');
        }
    };

    // Add novel to library without downloading chapters
    const handleAddToLibrary = async () => {
        try {
            await ensureLiveNovelInDB();
            setAddedToLibrary(true);
            setShowMenu(false);
        } catch (error) {
            console.error('Failed to add to library:', error);
            alert('Failed to add to library.');
        }
    };

    const handleDownloadAll = async () => {
        if (!novel) return;
        const chaptersToDownload = chapters.filter(c => !c.content);
        if (chaptersToDownload.length === 0) {
            alert("All chapters are already downloaded!");
            return;
        }

        if (!confirm(`Download ${chaptersToDownload.length} chapters in background?`)) return;

        scraperService.downloadAll(novel.id, novel.title, chaptersToDownload.map(c => ({
            title: c.title,
            url: c.audioPath || '', // Use audioPath as the source URL
            audioPath: c.audioPath
        })));
    };

    const handleSync = async () => {
        if (!novel || !novel.sourceUrl) {
            alert("Cannot sync: Source URL missing");
            return;
        }

        setIsSyncing(true);
        setShowMenu(false);

        try {
            scraperService.syncNovel(novel.id, novel.sourceUrl, chapters.length);
        } catch (error) {
            console.error("Sync failed", error);
            alert("Failed to start sync.");
        } finally {
            setIsSyncing(false);
        }
    };

    const handleDelete = async () => {
        if (!novel) return;

        const confirmed = confirm(`Are you sure you want to delete "${novel.title}"? All chapters and progress will be removed.`);
        if (!confirmed) return;

        try {
            await dbService.deleteNovel(novel.id);
            navigate('/', { replace: true });
        } catch (error) {
            console.error("Deletion failed", error);
            alert("Failed to delete novel. Please try again.");
        }
    };



    if (loading) {
        return <div className="flex h-screen items-center justify-center dark:bg-background-dark"><p className="dark:text-white">Loading...</p></div>;
    }

    if (!novel) {
        return <div className="flex h-screen items-center justify-center dark:bg-background-dark"><p className="dark:text-white">Novel not found</p></div>;
    }

    // Live mode: build chapter list from web data
    const liveFilteredChapters = isLiveMode
        ? liveChapters
            .filter(ch => ch.title.toLowerCase().includes(searchQuery.toLowerCase()))
            .map((ch, idx) => ({ ...ch, _index: idx }))
        : [];
    if (sortOrder === 'desc' && isLiveMode) liveFilteredChapters.reverse();

    const filteredChapters = isLiveMode ? [] : chapters
        .filter(chapter => {
            const matchesSearch = chapter.title.toLowerCase().includes(searchQuery.toLowerCase());
            if (!matchesSearch) return false;

            switch (filter) {
                case 'read': return chapter.isRead;
                case 'unread': return !chapter.isRead;
                case 'downloaded': return chapter.content;
                default: return true;
            }
        })
        .sort((a, b) => {
            if (sortOrder === 'asc') {
                return a.orderIndex - b.orderIndex;
            } else {
                return b.orderIndex - a.orderIndex;
            }
        });

    return (
        <div className="h-screen w-full flex flex-col bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 font-sans overflow-hidden">
            {/* Top Navigation Bar using Global Header */}
            <Header
                title="Chapter Index"
                showBack={true}
                onBack={() => navigate('/')}
                className="bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md"
                withBorder
                rightActions={
                    <div className="relative flex items-center">
                        <button className="p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors" onClick={() => setShowMenu(!showMenu)}>
                            <MoreHorizontal className="text-primary" />
                        </button>

                        {/* Dropdown Menu */}
                        {showMenu && (
                            <>
                                <div className="fixed inset-0 z-50" onClick={() => setShowMenu(false)}></div>
                                <div className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-100 dark:border-slate-800 z-50 py-1 animate-in fade-in zoom-in-95 duration-200">
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
                                            onClick={handleAddToLibrary}
                                            disabled={addedToLibrary}
                                        >
                                            {addedToLibrary ? <BookmarkCheck size={16} /> : <BookmarkPlus size={16} />}
                                            {addedToLibrary ? 'Added to Library' : 'Add to Library'}
                                        </button>
                                    ) : (
                                        <>
                                            <button
                                                className="w-full text-left px-4 py-3 text-sm font-medium hover:bg-slate-50 dark:hover:bg-white/5 flex items-center gap-2 border-b border-slate-100 dark:border-white/5 text-slate-700 dark:text-slate-200"
                                                onClick={handleSync}
                                                disabled={isSyncing}
                                            >
                                                <DownloadCloud size={16} className={isSyncing ? "animate-pulse" : ""} />
                                                {isSyncing ? "Syncing..." : "Sync Chapters"}
                                            </button>
                                            <button
                                                className="w-full text-left px-4 py-3 text-sm font-medium hover:bg-red-50 dark:hover:bg-red-950/20 flex items-center gap-2 text-red-600 dark:text-red-400"
                                                onClick={handleDelete}
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
                                <div className="size-4 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
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

            {/* Scrollable Content Container */}
            <main className="flex-1 overflow-y-auto hide-scrollbar pb-24">
                {loading || !novel ? (
                    <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
                        <div className="size-12 border-4 border-primary border-t-transparent animate-spin rounded-full" />
                        <p className="text-slate-500 animate-pulse font-medium">Preparing chapters...</p>
                    </div>
                ) : (
                    <>
                        {/* Book Header Card */}
                        <div className="p-4 bg-background-light dark:bg-background-dark">
                            <div className="flex gap-5">
                                <div className="relative shrink-0">
                                    <div className="bg-center bg-no-repeat aspect-[2/3] bg-cover rounded-lg shadow-xl w-28 bg-slate-800 border border-white/10"
                                        style={{ backgroundImage: `url("${novel.coverUrl}")` }}>
                                    </div>
                                    <div className="absolute bottom-1 right-1 bg-primary text-[10px] text-white px-1.5 py-0.5 rounded font-sans uppercase tracking-wider font-bold">
                                        {novel.source || 'WEB'}
                                    </div>
                                </div>
                                <div className="flex flex-col justify-center flex-1 min-w-0">
                                    <h1 className="text-xl font-bold leading-tight mb-1 line-clamp-2">{novel.title}</h1>
                                    <p className="text-slate-500 dark:text-slate-400 text-base mb-2 italic truncate">by {novel.author}</p>
                                    <div className="flex flex-wrap gap-2">
                                        <span className="px-2 py-0.5 bg-green-500/10 text-green-500 text-xs rounded-full border border-green-500/20 font-sans">
                                            {novel.status || 'Ongoing'}
                                        </span>
                                        <span className="px-2 py-0.5 bg-primary/10 text-primary text-xs rounded-full border border-primary/20 font-sans">
                                            {isLiveMode ? liveChapters.length : chapters.length} Chapters
                                        </span>
                                        {isLiveMode && (
                                            <span className="px-2 py-0.5 bg-amber-500/10 text-amber-500 text-xs rounded-full border border-amber-500/20 font-sans">
                                                Live
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Summary & Meta */}
                            <div className="mt-6 flex flex-col gap-4">
                                {novel.summary && (
                                    <div className="text-sm leading-relaxed text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                                        <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary mb-2">Synopsis</h3>
                                        <p className="line-clamp-6">{novel.summary}</p>
                                    </div>
                                )}

                                {isPreviewMode && (
                                    <button
                                        onClick={handleInitialScrape}
                                        disabled={isScrapingNew}
                                        className="w-full h-14 bg-primary text-white rounded-xl font-bold flex items-center justify-center gap-3 shadow-lg shadow-primary/25 active:scale-[0.98] transition-all disabled:opacity-50"
                                    >
                                        {isScrapingNew ? (
                                            <div className="size-5 border-2 border-white border-t-transparent animate-spin rounded-full" />
                                        ) : (
                                            <DownloadCloud className="size-6" />
                                        )}
                                        {isScrapingNew ? 'Importing chapters...' : 'Add to Library & Scrape'}
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Progress Tracking (Dynamic) - hidden in live mode */}
                        {!isLiveMode && (() => {
                            const lastReadIndex = chapters.findIndex((ch: any) => ch.id === novel.lastReadChapterId);
                            const hasStarted = lastReadIndex >= 0;
                            const currentChapterNum = hasStarted ? lastReadIndex + 1 : 0;
                            const progressPercent = chapters.length > 0 && hasStarted ? Math.round((currentChapterNum / chapters.length) * 100) : 0;
                            const readChaptersCount = chapters.filter((ch: any) => ch.isRead).length;

                            return (
                                <div className="mx-4 mt-3 mb-4 p-3 rounded-xl bg-slate-100 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800">
                                    <div className="flex justify-between items-center mb-2">
                                        <div>
                                            <p className="text-[10px] uppercase tracking-widest text-slate-500 dark:text-slate-400 font-sans font-bold">Reading Progress</p>
                                            <p className="text-sm font-bold">
                                                {hasStarted ? (
                                                    <>Chapter {currentChapterNum} <span className="text-xs font-normal text-slate-500">of {chapters.length}</span></>
                                                ) : (
                                                    <span className="text-slate-400">Not Started</span>
                                                )}
                                            </p>
                                        </div>
                                        <p className="text-[11px] text-slate-500 dark:text-slate-400 font-sans">{readChaptersCount} read</p>
                                    </div>
                                    <div className="w-full bg-slate-300 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                                        <div className="bg-primary h-full rounded-full transition-all duration-300" style={{ width: `${progressPercent}%` }}></div>
                                    </div>
                                </div>
                            );
                        })()}

                        {/* Utilities & Search */}
                        <div
                            className="px-4 sticky top-0 z-40 bg-background-light dark:bg-background-dark py-2 flex flex-col gap-3 border-b border-slate-100 dark:border-slate-800"
                        >
                            <div className="flex gap-2">
                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                    <input
                                        className="w-full pl-10 pr-4 py-2 bg-slate-100 dark:bg-slate-900 border-none rounded-lg text-sm focus:ring-1 focus:ring-primary placeholder:text-slate-500 font-sans outline-none dark:text-white"
                                        placeholder="Search chapter title..."
                                        type="text"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                    />
                                </div>
                                <div className="relative">
                                    <button
                                        className={`flex items-center justify-center bg-slate-100 dark:bg-slate-900 px-3 h-full rounded-lg border-none hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors ${filter !== 'all' ? 'ring-2 ring-primary/50' : ''}`}
                                        onClick={() => setShowFilterMenu(!showFilterMenu)}
                                    >
                                        <Filter className={filter !== 'all' ? "text-primary" : "text-slate-500"} size={20} />
                                    </button>

                                    {/* Filter Menu */}
                                    {showFilterMenu && (
                                        <>
                                            <div className="fixed inset-0 z-10" onClick={() => setShowFilterMenu(false)}></div>
                                            <div className="absolute right-0 top-full mt-2 w-40 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-100 dark:border-slate-800 z-20 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                                                {[
                                                    { id: 'all', label: 'All Chapters' },
                                                    { id: 'unread', label: 'Unread' },
                                                    { id: 'read', label: 'Read' },
                                                    { id: 'downloaded', label: 'Downloaded' }
                                                ].map((opt) => (
                                                    <button
                                                        key={opt.id}
                                                        className={`w-full text-left px-4 py-2.5 text-sm font-medium hover:bg-slate-50 dark:hover:bg-white/5 flex items-center justify-between text-slate-700 dark:text-slate-200 ${filter === opt.id ? 'text-primary bg-primary/5' : ''}`}
                                                        onClick={() => {
                                                            setFilter(opt.id as any);
                                                            setShowFilterMenu(false);
                                                        }}
                                                    >
                                                        {opt.label}
                                                        {filter === opt.id && <CheckCircle size={14} />}
                                                    </button>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                            {!isLiveMode ? (
                                <div className="flex items-center justify-between py-1 border-y border-slate-200 dark:border-slate-800">
                                    <div className="flex items-center gap-2">
                                        <CheckCircle className="text-primary text-lg" size={20} />
                                        <span className="text-xs font-sans font-medium text-slate-600 dark:text-slate-300">Available offline</span>
                                    </div>
                                    <button
                                        className="text-xs font-sans font-bold text-primary hover:opacity-80 flex items-center gap-1"
                                        onClick={handleDownloadAll}
                                    >
                                        <Download size={16} />
                                        DOWNLOAD ALL
                                    </button>
                                </div>
                            ) : (
                                <div className="flex items-center justify-between py-1 border-y border-slate-200 dark:border-slate-800">
                                    <div className="flex items-center gap-2">
                                        <Save className="text-primary text-lg" size={20} />
                                        <span className="text-xs font-sans font-medium text-slate-600 dark:text-slate-300">Import to Library</span>
                                    </div>
                                    <button
                                        className="text-xs font-sans font-bold text-primary hover:opacity-80 flex items-center gap-1"
                                        onClick={handleLiveDownloadAll}
                                    >
                                        <Download size={16} />
                                        DOWNLOAD ALL
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Chapter List */}
                        <div className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
                            {isLiveMode ? (
                                <>
                                    {liveFilteredChapters.map((chapter, displayIdx) => (
                                        <div key={`${chapter.url}-${displayIdx}`}
                                            className="flex items-center gap-4 p-4 hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors cursor-pointer"
                                            onClick={() => navigate(`/read/live/${encodeURIComponent(chapter.url)}`, {
                                                state: {
                                                    liveMode: true,
                                                    chapterUrl: chapter.url,
                                                    chapterTitle: chapter.title,
                                                    novelTitle: novel.title,
                                                    novelCoverUrl: novel.coverUrl,
                                                    chapters: liveChapters,
                                                    currentIndex: chapter._index,
                                                }
                                            })}
                                        >
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-3 mb-0.5">
                                                    <span className="text-slate-400 font-sans text-xs font-bold w-6 text-right shrink-0">
                                                        {sortOrder === 'desc' ? liveChapters.length - chapter._index : chapter._index + 1}
                                                    </span>
                                                    <div className="flex flex-col min-w-0">
                                                        <h3 className="text-sm font-bold truncate dark:text-slate-100">
                                                            {chapter.title}
                                                        </h3>
                                                        {(chapter as any).date && (
                                                            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                                                                {(chapter as any).date}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <button
                                                className="flex gap-3 p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                                onClick={(e) => handleLiveDownloadChapter(chapter, chapter._index, e)}
                                            >
                                                {downloadingLive.has(chapter.url) ? (
                                                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
                                                ) : downloadedLiveChapters.has(chapter.url) ? (
                                                    <CheckCircle className="text-green-500" size={20} />
                                                ) : (
                                                    <DownloadCloud className="text-slate-300 dark:text-slate-700" size={20} />
                                                )}
                                            </button>
                                        </div>
                                    ))}

                                    {/* Loading more pages indicator */}
                                    {loadingPage > 0 && (
                                        <div className="flex items-center justify-center py-4 gap-2">
                                            <Loader2 className="w-4 h-4 animate-spin text-primary" />
                                            <span className="text-xs text-slate-400 dark:text-slate-500">
                                                Loading page {loadingPage + 1}...
                                            </span>
                                        </div>
                                    )}

                                    {liveFilteredChapters.length === 0 && !loading && loadingPage === 0 && (
                                        <div className="p-8 text-center text-slate-500">
                                            No chapters found.
                                        </div>
                                    )}
                                </>
                            ) : (
                                <>
                                    {filteredChapters.map((chapter) => (
                                        <div key={chapter.id}
                                            className="flex items-center gap-4 p-4 hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors cursor-pointer"
                                            onClick={() => navigate(`/read/${novel.id}/${chapter.id}`)}
                                        >
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-3 mb-0.5">
                                                    {(() => {
                                                        const index = chapter.orderIndex + 1;
                                                        const hasNumbering = new RegExp(`^(Chapter|Episode)\\s+${index}\\b|^${index}\\.\\s+`, 'i').test(chapter.title);
                                                        if (!hasNumbering) {
                                                            return <span className="text-slate-400 font-sans text-xs font-bold w-6 text-right shrink-0">{index}</span>;
                                                        }
                                                        return null;
                                                    })()}
                                                    <h3 className={`text-sm font-bold truncate dark:text-slate-100 ${chapter.isRead ? 'opacity-60 font-normal' : ''}`}>
                                                        {(() => {
                                                            let title = chapter.title;
                                                            const index = chapter.orderIndex + 1;
                                                            const cleanRegex = new RegExp(`^${index}[\\.\\s]+`, 'i');
                                                            if (cleanRegex.test(title)) {
                                                                title = title.replace(cleanRegex, '');
                                                            }
                                                            return title;
                                                        })()}
                                                    </h3>
                                                </div>
                                            </div>
                                            <button
                                                className="flex gap-3 p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                                onClick={(e) => handleDownload(chapter, e)}
                                            >
                                                {downloading.has(chapter.id) ? (
                                                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
                                                ) : chapter.content ? (
                                                    <CheckCircle className="text-green-500" size={20} />
                                                ) : (
                                                    <DownloadCloud className="text-slate-300 dark:text-slate-700" size={20} />
                                                )}
                                            </button>
                                        </div>
                                    ))}

                                    {filteredChapters.length === 0 && (
                                        <div className="p-8 text-center text-slate-500">
                                            {chapters.length === 0 ? "No chapters found." : "No chapters match your filter."}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </>
                )}
            </main>

            {/* Floating Action Button */}
            <div className="fixed bottom-6 right-6 z-50">
                <button
                    className="flex items-center gap-2 bg-primary text-white px-6 py-4 rounded-full shadow-2xl hover:scale-105 transition-transform active:scale-95 font-sans font-bold"
                    onClick={() => {
                        if (isLiveMode && liveChapters.length > 0) {
                            const ch = liveChapters[0];
                            navigate(`/read/live/${encodeURIComponent(ch.url)}`, {
                                state: {
                                    liveMode: true,
                                    chapterUrl: ch.url,
                                    chapterTitle: ch.title,
                                    novelTitle: novel.title,
                                    novelCoverUrl: novel.coverUrl,
                                    chapters: liveChapters,
                                    currentIndex: 0,
                                }
                            });
                        } else if (chapters.length > 0) {
                            const lastReadId = novel?.lastReadChapterId;
                            const targetId = lastReadId && chapters.some(c => c.id === lastReadId)
                                ? lastReadId
                                : chapters[0].id;
                            navigate(`/read/${novel.id}/${targetId}`);
                        }
                    }}
                >
                    <PlayCircle size={24} />
                    {isLiveMode
                        ? 'START READING'
                        : novel?.lastReadChapterId && chapters.some(c => c.id === novel.lastReadChapterId)
                            ? 'CONTINUE READING'
                            : 'START READING'}
                </button>
            </div>

            <CompletionModal
                isOpen={modalInfo.isOpen}
                onClose={() => setModalInfo({ ...modalInfo, isOpen: false })}
                title={modalInfo.title}
                message={modalInfo.message}
            />
        </div>
    );
};
