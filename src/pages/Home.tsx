import { useState, useEffect, useMemo, useRef } from 'react';
import { FooterNavigation } from '../components/FooterNavigation';
import { Header } from '../components/Header';
import { dbService, type Novel } from '../services/db.service';
import { Link, useLocation } from 'react-router-dom';
import { Search, Bell, Plus, X, BookOpen, Clock } from 'lucide-react';
import { notificationService } from '../services/notification.service';
import { useVirtualizer } from '@tanstack/react-virtual';

export const Home = () => {
    const [novels, setNovels] = useState<Novel[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [editMode, setEditMode] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('All');
    const containerRef = useRef<HTMLDivElement>(null);
    const location = useLocation();

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

    useEffect(() => {
        console.log("Home: novels state updated", novels.length);
        novels.forEach(n => console.log(`- ${n.title} [${n.category}]`));
    }, [novels]);

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        sessionStorage.setItem('homeScroll', e.currentTarget.scrollTop.toString());
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

    // Continue Reading (Top 3 recently read)
    const continueReading = useMemo(() => {
        return novels
            .filter(n => n.lastReadChapterId && n.lastReadAt)
            .sort((a, b) => (b.lastReadAt || 0) - (a.lastReadAt || 0))
            .slice(0, 3);
    }, [novels]);

    // Virtualization (Grid)
    const COLUMN_COUNT = 3; // Mobile friendly grid
    const rowCount = Math.ceil((filteredNovels.length + 1) / COLUMN_COUNT); // +1 for "Import New" card

    const rowVirtualizer = useVirtualizer({
        count: rowCount,
        getScrollElement: () => containerRef.current,
        estimateSize: () => 240, // Height of card row + gap
        overscan: 5,
    });

    const profileImage = localStorage.getItem('profileImage') || "https://img.freepik.com/free-psd/3d-illustration-person-with-sunglasses_23-2149436188.jpg";

    return (
        <div className="h-screen w-full flex flex-col bg-background-light dark:bg-background-dark overflow-hidden">
            {/* Scrollable Content */}
            <div
                ref={containerRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto pb-24 scroll-smooth"
            >
                {/* Header Section */}
                <div className="sticky top-0 z-20 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md pb-2 border-b border-black/5 dark:border-white/5">
                    <Header
                        title="Library"
                        leftContent={
                            <Link to="/profile" className="flex size-10 shrink-0 items-center overflow-hidden rounded-full ring-2 ring-primary/20 transition-transform active:scale-95">
                                <img src={profileImage} alt="Profile" className="size-full object-cover" loading="lazy" />
                            </Link>
                        }
                        rightActions={
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setEditMode(!editMode)}
                                    className={`text-sm font-bold px-3 py-1.5 rounded-full transition-colors ${editMode ? 'bg-red-500/10 text-red-500' : 'text-primary'}`}
                                >
                                    {editMode ? 'Done' : 'Edit'}
                                </button>
                                <Link to="/notifications" className="flex items-center justify-center p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors relative">
                                    <Bell size={22} className="text-slate-700 dark:text-white" />
                                    {unreadCount > 0 && (
                                        <span className="absolute top-1.5 right-1.5 size-4 bg-primary text-white text-[10px] font-bold flex items-center justify-center rounded-full ring-2 ring-white dark:ring-background-dark">
                                            {unreadCount}
                                        </span>
                                    )}
                                </Link>
                            </div>
                        }
                        transparent
                    />

                    {/* Search Bar */}
                    <div className="px-4 py-2">
                        <div className="flex w-full items-center rounded-xl bg-slate-100 dark:bg-[#2b2839] border border-transparent focus-within:border-primary/50 transition-colors">
                            <div className="pl-3 text-slate-400">
                                <Search size={18} />
                            </div>
                            <input
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="flex-1 bg-transparent border-none py-2.5 px-3 text-sm focus:outline-none placeholder:text-slate-400 dark:text-white"
                                placeholder="Search library..."
                            />
                            {searchQuery && (
                                <button onClick={() => setSearchQuery('')} className="pr-3 text-slate-400">
                                    <X size={16} />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Categories */}
                    <div className="flex gap-2 px-4 pb-2 overflow-x-auto hide-scrollbar">
                        {categories.map((cat) => (
                            <button
                                key={cat}
                                onClick={() => setSelectedCategory(cat)}
                                className={`flex h-8 shrink-0 items-center justify-center rounded-full px-4 text-xs font-medium transition-all ${selectedCategory === cat
                                    ? 'bg-primary text-white shadow-md shadow-primary/20'
                                    : 'bg-slate-100 dark:bg-[#2b2839] text-slate-600 dark:text-slate-300'
                                    }`}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="px-4 pt-4">
                    {/* Continue Reading Section */}
                    {!searchQuery && selectedCategory === 'All' && continueReading.length > 0 && (
                        <div className="mb-6">
                            <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
                                <Clock size={18} className="text-primary" />
                                Continue Reading
                            </h3>
                            <div className="flex gap-3 overflow-x-auto hide-scrollbar pb-2 snap-x">
                                {continueReading.map(novel => (
                                    <Link
                                        key={'cont-' + novel.id}
                                        to={novel.category === 'Manhwa' ? `/manhwa/${novel.id}` : `/novel/${novel.id}`}
                                        className="snap-start shrink-0 w-32 flex flex-col gap-2 group"
                                    >
                                        <div className="relative aspect-[2/3] w-full rounded-lg overflow-hidden shadow-md ring-1 ring-black/5 dark:ring-white/10">
                                            <img
                                                src={novel.coverUrl || '/placeholder-cover.jpg'}
                                                alt={novel.title}
                                                className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-105"
                                                loading="lazy"
                                            />
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60" />
                                            <div className="absolute bottom-2 left-2 right-2">
                                                <div className="h-1 bg-white/30 rounded-full overflow-hidden backdrop-blur-sm">
                                                    <div
                                                        className="h-full bg-primary"
                                                        style={{ width: `${Math.min(100, ((novel.readChapters || 0) / (novel.totalChapters || 1)) * 100)}%` }}
                                                    />
                                                </div>
                                                <p className="text-[10px] text-white/90 mt-1 font-medium truncate">
                                                    {(novel.readChapters || 0)} / {novel.totalChapters || '?'} Ch
                                                </p>
                                            </div>
                                        </div>
                                        <p className="text-xs font-semibold line-clamp-1 group-active:text-primary transition-colors">{novel.title}</p>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Main Collection Grid */}
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-lg font-bold">My Collection <span className="text-xs font-normal text-slate-500 ml-2">({filteredNovels.length})</span></h3>
                    </div>

                    {filteredNovels.length === 0 && !searchQuery ? (
                        // Empty State
                        <div className="flex flex-col items-center justify-center py-20 text-center opacity-70">
                            <BookOpen size={48} className="mb-4 text-slate-300 dark:text-slate-600" />
                            <p className="text-sm font-medium">Your library is empty</p>
                            <p className="text-xs text-slate-500 mt-1">Discover new novels to add to your collection</p>
                            <Link to="/discover" className="mt-4 text-primary text-sm font-bold">Go to specific logic</Link>
                        </div>
                    ) : filteredNovels.length === 0 && searchQuery ? (
                        <div className="text-center py-10 text-slate-500">
                            <p>No results found for "{searchQuery}"</p>
                        </div>
                    ) : (
                        // Virtualized Grid
                        <div
                            style={{
                                height: `${rowVirtualizer.getTotalSize()}px`,
                                width: '100%',
                                position: 'relative',
                            }}
                        >
                            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                                const startIndex = virtualRow.index * COLUMN_COUNT;
                                const rowItems = filteredNovels.slice(startIndex, startIndex + COLUMN_COUNT);

                                // Last row might contain "Import New" button if we are at the end
                                const isLastRow = virtualRow.index === rowCount - 1;
                                const showImport = isLastRow && !searchQuery && selectedCategory === 'All';

                                return (
                                    <div
                                        key={virtualRow.key}
                                        style={{
                                            position: 'absolute',
                                            top: 0,
                                            left: 0,
                                            width: '100%',
                                            height: `${virtualRow.size}px`,
                                            transform: `translateY(${virtualRow.start}px)`,
                                        }}
                                        className="grid grid-cols-3 gap-3"
                                    >
                                        {rowItems.map((novel) => (
                                            <Link
                                                key={novel.id}
                                                to={editMode ? '#' : (novel.category === 'Manhwa' ? `/manhwa/${novel.id}` : `/novel/${novel.id}`)}
                                                className="flex flex-col gap-2 group relative w-full"
                                            >
                                                {/* Edit Mode Delete Badge */}
                                                {editMode && (
                                                    <button
                                                        onClick={(e) => handleDeleteNovel(novel.id, e)}
                                                        className="absolute -top-2 -right-2 z-10 size-7 bg-red-500 rounded-full flex items-center justify-center shadow-lg animate-in zoom-in duration-200"
                                                    >
                                                        <X size={16} className="text-white" />
                                                    </button>
                                                )}

                                                <div className={`relative aspect-[2/3] w-full rounded-lg overflow-hidden shadow-sm bg-slate-200 dark:bg-white/5 ring-1 ring-black/5 dark:ring-white/5 ${editMode ? 'animate-pulse ring-2 ring-red-500/50' : ''}`}>
                                                    <img
                                                        src={novel.coverUrl || '/placeholder-cover.jpg'}
                                                        alt={novel.title}
                                                        className="absolute inset-0 size-full object-cover transition-transform duration-300 group-hover:scale-105"
                                                        loading="lazy"
                                                    />
                                                    {/* Progress Bar Overlay */}
                                                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/30 backdrop-blur-sm">
                                                        <div
                                                            className="h-full bg-primary"
                                                            style={{ width: `${Math.min(100, ((novel.readChapters || 0) / (novel.totalChapters || 1)) * 100)}%` }}
                                                        />
                                                    </div>

                                                    {/* Badge for Type */}
                                                    {novel.category && novel.category !== 'Unknown' && (
                                                        <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur-sm">
                                                            <p className="text-[9px] font-bold text-white uppercase tracking-wider">{novel.category}</p>
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="flex flex-col px-0.5">
                                                    <p className="font-semibold text-xs sm:text-sm line-clamp-2 leading-tight group-active:text-primary transition-colors">{novel.title}</p>
                                                    <div className="flex items-center gap-1 mt-0.5">
                                                        <p className="text-slate-500 dark:text-slate-400 text-[10px] truncate max-w-[80px]">{novel.author}</p>
                                                        {(novel.readChapters || 0) > 0 && (
                                                            <span className="text-[10px] text-primary font-medium ml-auto">
                                                                {Math.round(((novel.readChapters || 0) / (novel.totalChapters || 1)) * 100)}%
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </Link>
                                        ))}

                                        {/* Import Button (Appended to grid) */}
                                        {showImport && rowItems.length < COLUMN_COUNT && (
                                            <Link to="/import" className="relative aspect-[2/3] w-full rounded-lg border-2 border-dashed border-slate-300 dark:border-white/10 flex flex-col items-center justify-center gap-2 hover:bg-primary/5 hover:border-primary/50 transition-all active:scale-95 group">
                                                <div className="size-10 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                                                    <Plus className="text-slate-400 group-hover:text-primary" size={20} />
                                                </div>
                                                <span className="text-[10px] font-bold text-slate-500 group-hover:text-primary">Import New</span>
                                            </Link>
                                        )}
                                        {/* If it's the last row and we need the import button but the row is full, we need logic to handle that. 
                                           However, simplifying: The user can always use the + button in the header or we append it to list. 
                                           For simpler grid logic without complexity, let's keep it here. */}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    {/* Floating Import Button for when grid is full or empty */}
                    {!searchQuery && selectedCategory === 'All' && (
                        <div className="flex justify-center mt-6 mb-4">
                            <Link to="/import" className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-slate-200 dark:bg-[#2b2839] text-xs font-bold hover:bg-primary hover:text-white transition-colors">
                                <Plus size={16} />
                                <span>Import Series</span>
                            </Link>
                        </div>
                    )}
                </div>
            </div>

            <FooterNavigation />
        </div >
    );
};
