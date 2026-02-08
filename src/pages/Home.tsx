
import { useState, useEffect } from 'react';
import { Navbar } from '../components/Navbar';
import { dbService } from '../services/database.service';
import { Link } from 'react-router-dom';
import { Search, Bell, Plus } from 'lucide-react';
import { notificationService } from '../services/notification.service';

export const Home = () => {
    const [novels, setNovels] = useState<any[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);

    useEffect(() => {
        loadLibrary();
        const unsubscribe = notificationService.subscribe(() => {
            setUnreadCount(notificationService.getUnreadCount());
        });
        return unsubscribe;
    }, []);

    const loadLibrary = async () => {
        try {
            console.log("Initializing database for Home...");
            await dbService.initialize();
            const data = await dbService.getNovels();
            setNovels(data);
        } catch (error) {
            console.error("Failed to load library", error);
            // Fallback for UI if DB fails
            setNovels([]);
        }
    };

    const profileImage = localStorage.getItem('profileImage') || "https://lh3.googleusercontent.com/aida-public/AB6AXuDjCOham51YfTM7PcgkgKspU9PvDHuom_3rGeCzHDOnhZnOzp09BhpYTuEnobo9LY8vOsfLsujPy9_QEMQ7WaQQSrFMdLgnji7T5irQ-C7DSmSq-0RKsDtEHLdFk2Jd7O9Qpw1VCPG_71gSZCD9ROyRef4a9hy1bzxv5Kmeyh5eiAx9wKqIXAtSkLrqYxyMQFSb2RIi6syEVabDEHarMZ8ece6wHlOJW3ky5o3LtKvE3JC2EZaJpRlwT5R61uO6G-mUqtqV5qNjIYyE";

    return (
        <div className="h-screen w-full flex flex-col bg-background-light dark:bg-background-dark overflow-hidden">
            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto pb-24">
                {/* Top App Bar */}
                <div className="sticky top-0 z-20 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md pt-[16px]">
                    <div className="flex items-center p-4 pb-2 justify-between relative">
                        <Link to="/profile" className="flex size-10 shrink-0 items-center overflow-hidden rounded-full ring-2 ring-primary/20 transition-transform active:scale-95">
                            <div className="bg-center bg-no-repeat aspect-square bg-cover size-full" style={{ backgroundImage: `url("${profileImage}")` }}></div>
                        </Link>
                        <h2 className="text-xl font-bold leading-tight tracking-tight absolute left-1/2 -translate-x-1/2">Library</h2>
                        <div className="flex w-10 items-center justify-end">
                            <Link to="/notifications" className="flex items-center justify-center p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors relative">
                                <Bell size={22} className="text-slate-700 dark:text-white" />
                                {unreadCount > 0 && (
                                    <span className="absolute top-1.5 right-1.5 size-4 bg-primary text-white text-[10px] font-bold flex items-center justify-center rounded-full ring-2 ring-white dark:ring-background-dark">
                                        {unreadCount}
                                    </span>
                                )}
                            </Link>
                        </div>
                    </div>
                    {/* Search Bar */}
                    <div className="px-4 py-3">
                        <label className="flex flex-col min-w-40 h-11 w-full">
                            <div className="flex w-full flex-1 items-stretch rounded-xl h-full bg-slate-200/50 dark:bg-[#2b2839]">
                                <div className="text-slate-500 dark:text-[#a19db9] flex items-center justify-center pl-4">
                                    <Search size={20} />
                                </div>
                                <input className="form-input flex w-full min-w-0 flex-1 border-none bg-transparent focus:outline-0 focus:ring-0 text-base font-normal placeholder:text-slate-500 dark:placeholder:text-[#a19db9] px-3" placeholder="Search titles, authors..." />
                            </div>
                        </label>
                    </div>
                    {/* Category Filters */}
                    <div className="flex gap-2 px-4 pb-4 overflow-x-auto hide-scrollbar">
                        {['All', 'Fantasy', 'Sci-Fi', 'Romance', 'Imported'].map((cat, i) => (
                            <button key={cat} className={`flex h-9 shrink-0 items-center justify-center rounded-full px-5 transition-colors ${i === 0 ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-slate-200 dark:bg-[#2b2839] hover:bg-slate-300 dark:hover:bg-[#3f3b54]'}`}>
                                <p className="text-sm font-medium">{cat}</p>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Collection Grid */}
                <div className="flex items-center justify-between px-4 pt-4 pb-3">
                    <h3 className="text-lg font-bold tracking-tight">My Collection</h3>
                    <button className="text-primary text-sm font-medium">Edit</button>
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-3 px-4 pb-4">
                    {novels.map((novel) => (
                        <Link key={novel.id} to={`/novel/${novel.id}`} className="flex flex-col gap-2 group">
                            <div className="relative aspect-[2/3] w-full rounded-lg overflow-hidden shadow-md group-active:scale-95 transition-transform duration-200">
                                <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url('${novel.coverUrl}')` }}></div>
                                <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/20">
                                    <div className="h-full bg-primary" style={{ width: '0%' }}></div>
                                </div>
                            </div>
                            <div className="flex flex-col px-0.5">
                                <p className="font-semibold text-sm line-clamp-1">{novel.title}</p>
                                <p className="text-slate-500 dark:text-[#a19db9] text-[11px] font-medium">{novel.author}</p>
                            </div>
                        </Link>
                    ))}

                    <div className="flex flex-col gap-2 group">
                        <Link to="/import" className="relative aspect-[2/3] w-full rounded-lg border-2 border-dashed border-slate-300 dark:border-[#3f3b54] flex flex-col items-center justify-center gap-2 hover:bg-primary/5 hover:border-primary/50 transition-all active:scale-95">
                            <Plus className="text-primary" size={24} />
                            <span className="text-[11px] font-semibold text-primary">Import New</span>
                        </Link>
                    </div>
                </div>
            </div>

            <Navbar />
        </div >
    );
};
