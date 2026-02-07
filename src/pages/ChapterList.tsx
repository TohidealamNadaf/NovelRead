import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { dbService } from '../services/database.service';
import { ArrowLeft, MoreHorizontal, Search, Filter, Download, CheckCircle, DownloadCloud, PlayCircle } from 'lucide-react';

export const ChapterList = () => {
    const { novelId } = useParams<{ novelId: string }>();
    const navigate = useNavigate();
    const [novel, setNovel] = useState<any>(null);
    const [chapters, setChapters] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

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

    if (loading) {
        return <div className="flex h-screen items-center justify-center dark:bg-background-dark"><p className="dark:text-white">Loading...</p></div>;
    }

    if (!novel) {
        return <div className="flex h-screen items-center justify-center dark:bg-background-dark"><p className="dark:text-white">Novel not found</p></div>;
    }

    return (
        <div className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 font-sans min-h-screen pb-20">
            {/* Top Navigation Bar */}
            <div className="sticky top-0 z-50 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center p-4 justify-between max-w-lg mx-auto">
                    <div className="flex items-center gap-2" onClick={() => navigate('/')}>
                        <ArrowLeft className="text-primary cursor-pointer" />
                        <span className="text-sm font-medium cursor-pointer">Library</span>
                    </div>
                    <h2 className="text-lg font-bold truncate px-4">Chapter Index</h2>
                    <div className="flex items-center">
                        <button className="p-1">
                            <MoreHorizontal className="text-primary" />
                        </button>
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
                            <input className="w-full pl-10 pr-4 py-2 bg-slate-100 dark:bg-slate-900 border-none rounded-lg text-sm focus:ring-1 focus:ring-primary placeholder:text-slate-500 font-sans outline-none dark:text-white" placeholder="Search chapter title..." type="text" />
                        </div>
                        <button className="flex items-center justify-center bg-slate-100 dark:bg-slate-900 px-3 rounded-lg border-none hover:bg-slate-200 dark:hover:bg-slate-800">
                            <Filter className="text-slate-500" size={20} />
                        </button>
                    </div>
                    <div className="flex items-center justify-between py-1 border-y border-slate-200 dark:border-slate-800">
                        <div className="flex items-center gap-2">
                            <CheckCircle className="text-primary text-lg" size={20} />
                            <span className="text-xs font-sans font-medium text-slate-600 dark:text-slate-300">Available offline</span>
                        </div>
                        <button className="text-xs font-sans font-bold text-primary hover:opacity-80 flex items-center gap-1">
                            <Download size={16} />
                            DOWNLOAD ALL
                        </button>
                    </div>
                </div>

                {/* Chapter List */}
                <div className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
                    {chapters.map((chapter, index) => (
                        <div key={chapter.id}
                            className="flex items-center gap-4 p-4 hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors cursor-pointer"
                            onClick={() => navigate(`/read/${novel.id}/${chapter.id}`)}
                        >
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5">
                                    <span className="text-slate-500 font-sans text-xs">{index + 1}</span>
                                    <h3 className="text-base font-medium truncate dark:text-slate-200">{chapter.title}</h3>
                                </div>
                                <div className="flex items-center gap-3 text-xs text-slate-500 font-sans">
                                    {/* <span>2.4k words</span> */}
                                    {/* <span className="flex items-center gap-1"><History size={14} /> Oct 12</span> */}
                                </div>
                            </div>
                            <div className="flex gap-3">
                                {/* <Circle className="text-slate-300 dark:text-slate-700" size={20} /> */}
                                <DownloadCloud className="text-slate-300 dark:text-slate-700" size={20} />
                            </div>
                        </div>
                    ))}

                    {chapters.length === 0 && (
                        <div className="p-8 text-center text-slate-500">
                            No chapters found.
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
