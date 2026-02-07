
import { useState, useEffect } from 'react';
import { BookOpen, Headphones, History, CreditCard, Settings, Shield, LogOut, Edit, MoreVertical } from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { dbService } from '../services/database.service';

export const Profile = () => {
    const [stats, setStats] = useState({ chaptersRead: 0, novelsCount: 0 });

    useEffect(() => {
        loadStats();
    }, []);

    const loadStats = async () => {
        try {
            const novels = await dbService.getNovels();
            // Mocking "Chapters Read" by just summing up chapters of all novels (since isRead isn't fully tracked per user session yet in this demo)
            // Ideally: SELECT COUNT(*) FROM chapters WHERE isRead = 1
            let totalChapters = 0;
            // Since we don't have isRead fully implemented in the addChapter logic above (defaults to 0), 
            // let's just count total imported chapters for this demo stat
            for (const novel of novels) {
                const chapters = await dbService.getChapters(novel.id);
                totalChapters += chapters.length;
            }
            setStats({ chaptersRead: totalChapters, novelsCount: novels.length });
        } catch (e) {
            console.error("Failed to load stats", e);
        }
    };

    return (
        <div className="bg-background-dark text-white min-h-screen pb-24 font-sans">
            <div className="relative flex h-full min-h-screen w-full flex-col overflow-x-hidden">
                {/* Header */}
                <div className="sticky top-0 z-20 bg-background-dark/80 backdrop-blur-md px-4 py-4 pb-2 pt-safe">
                    <div className="flex items-center justify-between">
                        <div className="w-10"></div>
                        <h2 className="text-xl font-bold leading-tight tracking-tight flex-1 text-center">Profile</h2>
                        <div className="flex w-10 items-center justify-end">
                            <button className="flex items-center justify-center p-2 rounded-full hover:bg-white/10 transition-colors">
                                <MoreVertical size={20} />
                            </button>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col items-center px-4 py-8">
                    <div className="relative group">
                        <div className="size-28 shrink-0 items-center overflow-hidden rounded-full ring-4 ring-primary/20 shadow-2xl">
                            <div className="bg-center bg-no-repeat aspect-square bg-cover size-full" style={{ backgroundImage: "url('https://lh3.googleusercontent.com/aida-public/AB6AXuDjCOham51YfTM7PcgkgKspU9PvDHuom_3rGeCzHDOnhZnOzp09BhpYTuEnobo9LY8vOsfLsujPy9_QEMQ7WaQQSrFMdLgnji7T5irQ-C7DSmSq-0RKsDtEHLdFk2Jd7O9Qpw1VCPG_71gSZCD9ROyRef4a9hy1bzxv5Kmeyh5eiAx9wKqIXAtSkLrqYxyMQFSb2RIi6syEVabDEHarMZ8ece6wHlOJW3ky5o3LtKvE3JC2EZaJpRlwT5R61uO6G-mUqtqV5qNjIYyE')" }}></div>
                        </div>
                        <button className="absolute bottom-0 right-0 size-8 bg-primary rounded-full flex items-center justify-center border-2 border-background-dark shadow-lg">
                            <Edit size={14} />
                        </button>
                    </div>
                    <h1 className="mt-4 text-2xl font-bold">Alex Rivera</h1>
                    <p className="text-slate-400 text-sm">Premium Member</p>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-4 px-4 pb-6">
                    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-white/5 bg-[#121118] p-4 shadow-sm">
                        <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <BookOpen size={24} />
                        </div>
                        <div className="text-center">
                            <p className="text-lg font-bold leading-tight">{stats.chaptersRead}</p>
                            <p className="text-slate-400 text-[11px] font-medium uppercase tracking-wider">Chapters Saved</p>
                        </div>
                    </div>
                    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-white/5 bg-[#121118] p-4 shadow-sm">
                        <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <Headphones size={24} />
                        </div>
                        <div className="text-center">
                            <p className="text-lg font-bold leading-tight">{stats.novelsCount}</p>
                            <p className="text-slate-400 text-[11px] font-medium uppercase tracking-wider">Novels in Lib</p>
                        </div>
                    </div>
                </div>

                {/* Settings List */}
                <div className="px-4 flex flex-col gap-3 pb-32">
                    <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-widest px-1">Settings & History</h3>

                    <button className="group flex items-center justify-between w-full p-4 rounded-xl border border-white/5 bg-[#121118] hover:bg-white/5 transition-all">
                        <div className="flex items-center gap-3">
                            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-slate-300 group-hover:bg-primary group-hover:text-white transition-colors">
                                <History size={20} />
                            </div>
                            <div className="text-left">
                                <p className="font-semibold text-sm">Scraping History</p>
                                <p className="text-slate-500 text-[11px]">Manage your AI-scraped novels</p>
                            </div>
                        </div>
                        <div className="text-slate-500">{'>'}</div>
                    </button>

                    <button className="group flex items-center justify-between w-full p-4 rounded-xl border border-white/5 bg-[#121118] hover:bg-white/5 transition-all">
                        <div className="flex items-center gap-3">
                            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-slate-300 group-hover:bg-primary group-hover:text-white transition-colors">
                                <CreditCard size={20} />
                            </div>
                            <div className="text-left">
                                <p className="font-semibold text-sm">Subscription</p>
                                <p className="text-slate-500 text-[11px]">Premium expires in 12 days</p>
                            </div>
                        </div>
                        <div className="text-slate-500">{'>'}</div>
                    </button>

                    <button className="group flex items-center justify-between w-full p-4 rounded-xl border border-white/5 bg-[#121118] hover:bg-white/5 transition-all">
                        <div className="flex items-center gap-3">
                            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-slate-300 group-hover:bg-primary group-hover:text-white transition-colors">
                                <Settings size={20} />
                            </div>
                            <div className="text-left">
                                <p className="font-semibold text-sm">App Settings</p>
                                <p className="text-slate-500 text-[11px]">Audio, appearance & storage</p>
                            </div>
                        </div>
                        <div className="text-slate-500">{'>'}</div>
                    </button>

                    <button className="group flex items-center justify-between w-full p-4 rounded-xl border border-white/5 bg-[#121118] hover:bg-white/5 transition-all">
                        <div className="flex items-center gap-3">
                            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-slate-300 group-hover:bg-primary group-hover:text-white transition-colors">
                                <Shield size={20} />
                            </div>
                            <div className="text-left">
                                <p className="font-semibold text-sm">Privacy & Security</p>
                                <p className="text-slate-500 text-[11px]">Secure your reading data</p>
                            </div>
                        </div>
                        <div className="text-slate-500">{'>'}</div>
                    </button>

                    <button className="mt-4 flex items-center justify-center w-full p-4 rounded-xl border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-all">
                        <LogOut size={20} className="mr-2" />
                        <p className="font-semibold text-sm">Logout</p>
                    </button>
                </div>

                <Navbar />
            </div>
        </div>
    );
};
