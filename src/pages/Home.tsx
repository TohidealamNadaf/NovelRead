import { useState, useEffect } from 'react';
import { FooterNavigation } from '../components/FooterNavigation';
import { Header } from '../components/Header';
import { dbService, type Novel } from '../services/db.service';
import { Link } from 'react-router-dom';
import { Search, Bell, Plus, X } from 'lucide-react';
import { notificationService } from '../services/notification.service';

export const Home = () => {
    const [novels, setNovels] = useState<Novel[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [editMode, setEditMode] = useState(false);

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

    const handleDeleteNovel = async (novelId: string, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (confirm('Are you sure you want to delete this novel? All chapters and progress will be removed.')) {
            try {
                await dbService.deleteNovel(novelId);
                setNovels(prev => prev.filter(n => n.id !== novelId));
            } catch (error) {
                console.error('Failed to delete novel:', error);
            }
        }
    };

    const profileImage = localStorage.getItem('profileImage') || "https://img.freepik.com/free-psd/3d-illustration-person-with-sunglasses_23-2149436188.jpg";

    return (
        <div className="h-screen w-full flex flex-col bg-background-light dark:bg-background-dark overflow-hidden">
            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto pb-24">
                {/* Top App Bar */}
                <div className="sticky top-0 z-20 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md">
                    <Header
                        title="Library"
                        leftContent={
                            <Link to="/profile" className="flex size-10 shrink-0 items-center overflow-hidden rounded-full ring-2 ring-primary/20 transition-transform active:scale-95">
                                <div className="bg-center bg-no-repeat aspect-square bg-cover size-full" style={{ backgroundImage: `url("${profileImage}")` }}></div>
                            </Link>
                        }
                        rightActions={
                            <Link to="/notifications" className="flex items-center justify-center p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors relative">
                                <Bell size={22} className="text-slate-700 dark:text-white" />
                                {unreadCount > 0 && (
                                    <span className="absolute top-1.5 right-1.5 size-4 bg-primary text-white text-[10px] font-bold flex items-center justify-center rounded-full ring-2 ring-white dark:ring-background-dark">
                                        {unreadCount}
                                    </span>
                                )}
                            </Link>
                        }
                        transparent
                    />

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
                    <button
                        onClick={() => setEditMode(!editMode)}
                        className={`text-sm font-medium ${editMode ? 'text-red-500' : 'text-primary'}`}
                    >
                        {editMode ? 'Done' : 'Edit'}
                    </button>
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-3 px-4 pb-4">
                    {novels.map((novel) => (
                        <Link key={novel.id} to={editMode ? '#' : (novel.category === 'Manhwa' ? `/manhwa/${novel.id}` : `/novel/${novel.id}`)} className="flex flex-col gap-2 group relative">
                            {/* Delete Badge */}
                            {editMode && (
                                <button
                                    onClick={(e) => handleDeleteNovel(novel.id, e)}
                                    className="absolute -top-1 -right-1 z-10 size-6 bg-red-500 rounded-full flex items-center justify-center shadow-lg animate-in zoom-in duration-200"
                                >
                                    <X size={14} className="text-white" />
                                </button>
                            )}
                            <div className={`relative aspect-[2/3] w-full rounded-lg overflow-hidden shadow-md group-active:scale-95 transition-transform duration-200 ${editMode ? 'animate-pulse ring-2 ring-red-500/50' : ''}`}>
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

            <FooterNavigation />
        </div >
    );
};
