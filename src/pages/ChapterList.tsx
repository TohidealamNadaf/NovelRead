import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { dbService } from '../services/database.service';
import { scraperService } from '../services/scraper.service';
import { ArrowLeft, MoreHorizontal, Search, Filter, Download, CheckCircle, DownloadCloud, PlayCircle } from 'lucide-react';

export const ChapterList = () => {
    const { novelId } = useParams<{ novelId: string }>();
    const navigate = useNavigate();
    const [showMenu, setShowMenu] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [filter, setFilter] = useState<'all' | 'read' | 'unread' | 'downloaded'>('all');
    const [showFilterMenu, setShowFilterMenu] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

    // Restore missing state variables
    const [novel, setNovel] = useState<any>(null);
    const [chapters, setChapters] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [downloading, setDownloading] = useState<Set<string>>(new Set());

    useEffect(() => {
        const loadData = async () => {
            if (novelId) {
                try {
                    await dbService.initialize();
                    const n = await dbService.getNovel(novelId);
                    setNovel(n);
                    const c = await dbService.getChapters(novelId);
                    setChapters(c);
                } catch (e) {
                    console.error("Failed to load novel data", e);
                } finally {
                    setLoading(false);
                }
            }
        };
        loadData();
    }, [novelId]);

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

    const handleDownloadAll = async () => {
        const chaptersToDownload = chapters.filter(c => !c.content);
        if (chaptersToDownload.length === 0) {
            alert("All chapters are already downloaded!");
            return;
        }

        if (!confirm(`Download ${chaptersToDownload.length} chapters? This might take a while.`)) return;

        for (const chapter of chaptersToDownload) {
            await handleDownload(chapter);
            await new Promise(r => setTimeout(r, 500));
        }
        alert("Download complete!");
    };

    const handleSync = async () => {
        if (!novel || !novel.sourceUrl) {
            alert("Cannot sync: Source URL missing");
            return;
        }

        setIsSyncing(true);
        setShowMenu(false);

        try {
            console.log(`Syncing novel from ${novel.sourceUrl}...`);
            const updatedNovel = await scraperService.fetchNovel(novel.sourceUrl);

            const existingUrls = new Set(chapters.map(c => c.audioPath));
            const newChapters = updatedNovel.chapters.filter(ch => !existingUrls.has(ch.url));

            if (newChapters.length === 0) {
                alert("No new chapters found.");
            } else {
                console.log(`Found ${newChapters.length} new chapters.`);
                const confirmSync = confirm(`Found ${newChapters.length} new chapters. Add them?`);

                if (confirmSync) {
                    let addedCount = 0;

                    for (const ch of newChapters) {
                        const index = updatedNovel.chapters.findIndex(c => c.url === ch.url);
                        const chapterId = `${novel.id}-ch-${index + 1}`;

                        await dbService.addChapter({
                            id: chapterId,
                            novelId: novel.id,
                            title: ch.title,
                            content: '',
                            orderIndex: index,
                            audioPath: ch.url
                        });
                        addedCount++;
                    }

                    const c = await dbService.getChapters(novel.id);
                    setChapters(c);
                    alert(`Successfully added ${addedCount} new chapters.`);
                }
            }

        } catch (error) {
            console.error("Sync failed", error);
            alert("Failed to sync chapters. Check your internet connection.");
        } finally {
            setIsSyncing(false);
        }
    };

    if (loading) {
        return <div className="flex h-screen items-center justify-center dark:bg-background-dark"><p className="dark:text-white">Loading...</p></div>;
    }

    if (!novel) {
        return <div className="flex h-screen items-center justify-center dark:bg-background-dark"><p className="dark:text-white">Novel not found</p></div>;
    }

    const filteredChapters = chapters
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
        <div className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 font-sans min-h-screen pb-20">
            {/* Top Navigation Bar */}
            <div className="sticky top-0 z-50 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center p-4 justify-between max-w-lg mx-auto">
                    <div className="flex items-center gap-2" onClick={() => navigate(-1)}>
                        <ArrowLeft className="text-primary cursor-pointer" />
                        <span className="text-sm font-medium cursor-pointer">Back</span>
                    </div>
                    <h2 className="text-lg font-bold truncate px-4">Chapter Index</h2>
                    <div className="relative flex items-center">
                        <button className="p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors" onClick={() => setShowMenu(!showMenu)}>
                            <MoreHorizontal className="text-primary" />
                        </button>

                        {/* Dropdown Menu */}
                        {showMenu && (
                            <>
                                <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)}></div>
                                <div className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-100 dark:border-slate-800 z-20 py-1 animate-in fade-in zoom-in-95 duration-200">
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
                                    <button
                                        className="w-full text-left px-4 py-3 text-sm font-medium hover:bg-slate-50 dark:hover:bg-white/5 flex items-center gap-2 text-slate-700 dark:text-slate-200"
                                        onClick={handleSync}
                                        disabled={isSyncing}
                                    >
                                        <DownloadCloud size={16} className={isSyncing ? "animate-pulse" : ""} />
                                        {isSyncing ? "Syncing..." : "Sync Chapters"}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>

            <main className="max-w-lg mx-auto pb-24">
                {/* Book Header Card */}
                <div className="p-4 bg-background-light dark:bg-background-dark">
                    <div className="flex gap-5">
                        <div className="relative shrink-0">
                            <div className="bg-center bg-no-repeat aspect-[2/3] bg-cover rounded-lg shadow-xl w-32 bg-slate-800 border border-white/10"
                                style={{ backgroundImage: `url("${novel.coverUrl}")` }}>
                            </div>
                            <div className="absolute bottom-1 right-1 bg-primary text-[10px] text-white px-1.5 py-0.5 rounded font-sans uppercase tracking-wider font-bold">
                                {novel.source || 'WEB'}
                            </div>
                        </div>
                        <div className="flex flex-col justify-center flex-1 min-w-0">
                            <h1 className="text-2xl font-bold leading-tight mb-1 line-clamp-2">{novel.title}</h1>
                            <p className="text-slate-500 dark:text-slate-400 text-base mb-2 italic truncate">by {novel.author}</p>
                            <div className="flex flex-wrap gap-2">
                                <span className="px-2 py-0.5 bg-green-500/10 text-green-500 text-xs rounded-full border border-green-500/20 font-sans">
                                    {novel.status || 'Ongoing'}
                                </span>
                                <span className="px-2 py-0.5 bg-primary/10 text-primary text-xs rounded-full border border-primary/20 font-sans">
                                    {chapters.length} Chapters
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Progress Tracking (Mock Data for now) */}
                <div className="mx-4 mb-6 p-4 rounded-xl bg-slate-100 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800">
                    <div className="flex justify-between items-end mb-2">
                        <div>
                            <p className="text-xs uppercase tracking-widest text-slate-500 dark:text-slate-400 font-sans font-bold">Reading Progress</p>
                            <p className="text-xl font-bold">Chapter {chapters.length > 0 ? 1 : 0} <span className="text-sm font-normal text-slate-500">of {chapters.length}</span></p>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-sans italic">--</p>
                    </div>
                    <div className="w-full bg-slate-300 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                        <div className="bg-primary h-full w-[1%] rounded-full"></div>
                    </div>
                </div>

                {/* Utilities & Search */}
                <div className="px-4 sticky top-[65px] z-40 bg-background-light dark:bg-background-dark py-2 flex flex-col gap-3">
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
                </div>

                {/* Chapter List */}
                <div className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredChapters.map((chapter) => (
                        <div key={chapter.id}
                            className="flex items-center gap-4 p-4 hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors cursor-pointer"
                            onClick={() => navigate(`/read/${novel.id}/${chapter.id}`)}
                        >
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-3 mb-0.5">
                                    {/* Content Awareness: Only show index if title doesn't look like "Chapter X" */}
                                    {(() => {
                                        const index = chapter.orderIndex + 1;
                                        // Check if title starts with "Chapter <index>" or "<index>."
                                        // Regex explanation:
                                        // ^Chapter\s+ : Starts with "Chapter "
                                        // ^\d+\.\s+ : Starts with "1. "
                                        // ^Episode\s+ : Starts with "Episode "
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

                                            // Robust cleanup for "1 Chapter 1" or "1. Chapter 1" patterns
                                            // This strips leading numbers if they match the index
                                            const cleanRegex = new RegExp(`^${index}[\\.\\s]+`, 'i');
                                            if (cleanRegex.test(title)) {
                                                title = title.replace(cleanRegex, '');
                                            }
                                            return title;
                                        })()}
                                    </h3>
                                </div>
                                <div className="flex items-center gap-3 text-xs text-slate-500 font-sans">
                                    {/* <span>2.4k words</span> */}
                                    {/* <span className="flex items-center gap-1"><History size={14} /> Oct 12</span> */}
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
                </div>
            </main>

            {/* Floating Action Button */}
            <div className="fixed bottom-6 right-6 z-50">
                <button
                    className="flex items-center gap-2 bg-primary text-white px-6 py-4 rounded-full shadow-2xl hover:scale-105 transition-transform active:scale-95 font-sans font-bold"
                    onClick={() => {
                        if (chapters.length > 0) {
                            navigate(`/read/${novel.id}/${chapters[0].id}`);
                        }
                    }}
                >
                    <PlayCircle size={24} />
                    START READING
                </button>
            </div>
        </div>
    );
};
