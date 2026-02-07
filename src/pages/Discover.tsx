import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Search, Bolt, BookOpen, Rocket, Heart, Swords, Download } from 'lucide-react';
import { scraperService } from '../services/scraper.service';
import { dbService } from '../services/database.service';
import { Navbar } from '../components/Navbar';

export const Discover = () => {
    const navigate = useNavigate();
    const [searchQuery, setSearchQuery] = useState('');
    const [isScraping, setIsScraping] = useState(false);
    const [recentScrapes, setRecentScrapes] = useState<any[]>([]);
    const [isFilterOpen, setIsFilterOpen] = useState(false);

    useEffect(() => {
        loadRecentScrapes();
    }, []);

    const loadRecentScrapes = async () => {
        try {
            const novels = await dbService.getNovels();
            setRecentScrapes(novels.slice(0, 5));
        } catch (e) {
            console.error("Failed to load recent scrapes", e);
        }
    };

    const handleSearch = async (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && searchQuery) {
            if (searchQuery.startsWith('http')) {
                await performQuickScrape(searchQuery);
            } else {
                alert(`Searching for: ${searchQuery}`);
            }
        }
    };

    const performQuickScrape = async (url: string) => {
        if (confirm("Start quick scrape for this novel?")) {
            setIsScraping(true);
            try {
                const novel = await scraperService.fetchNovel(url);
                await dbService.initialize();
                await dbService.addNovel({
                    id: btoa(novel.title),
                    title: novel.title,
                    author: novel.author,
                    coverUrl: novel.coverUrl,
                    sourceUrl: url,
                    category: 'Imported'
                });

                const chaptersToSave = novel.chapters.slice(0, 50);
                for (let i = 0; i < chaptersToSave.length; i++) {
                    const ch = chaptersToSave[i];
                    await dbService.addChapter({
                        id: `${btoa(novel.title)}-ch-${i + 1}`,
                        novelId: btoa(novel.title),
                        title: ch.title,
                        content: '',
                        orderIndex: i,
                        audioPath: ch.url
                    });
                }
                loadRecentScrapes(); // Refresh list
                navigate('/');
            } catch (e) {
                console.error(e);
                alert("Quick scrape failed");
            } finally {
                setIsScraping(false);
            }
        }
    };

    return (
        <div className="h-screen w-full flex flex-col bg-background-light dark:bg-background-dark font-sans selection:bg-primary/30 overflow-hidden">
            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto pb-24">
                {/* Header */}
                <div className="sticky top-0 z-20 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md pt-safe">
                    <div className="flex items-center p-4 pb-2 justify-between">
                        <Link to="/profile" className="flex size-10 shrink-0 items-center overflow-hidden rounded-full ring-2 ring-primary/20 transition-transform active:scale-95">
                            <div className="bg-center bg-no-repeat aspect-square bg-cover size-full" style={{ backgroundImage: 'url("https://lh3.googleusercontent.com/aida-public/AB6AXuDjCOham51YfTM7PcgkgKspU9PvDHuom_3rGeCzHDOnhZnOzp09BhpYTuEnobo9LY8vOsfLsujPy9_QEMQ7WaQQSrFMdLgnji7T5irQ-C7DSmSq-0RKsDtEHLdFk2Jd7O9Qpw1VCPG_71gSZCD9ROyRef4a9hy1bzxv5Kmeyh5eiAx9wKqIXAtSkLrqYxyMQFSb2RIi6syEVabDEHarMZ8ece6wHlOJW3ky5o3LtKvE3JC2EZaJpRlwT5R61uO6G-mUqtqV5qNjIYyE")' }}></div>
                        </Link>
                        <h2 className="text-xl font-bold leading-tight tracking-tight flex-1 text-center mr-[-40px]">Discover</h2>
                        <div className="flex w-10 items-center justify-end relative">
                            <button
                                onClick={() => setIsFilterOpen(!isFilterOpen)}
                                className="flex items-center justify-center p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                            >
                                <span className="material-symbols-outlined">filter_list</span>
                            </button>
                            {isFilterOpen && (
                                <div className="absolute top-full right-0 mt-2 w-48 bg-white dark:bg-[#1c1c1e] rounded-xl shadow-xl border border-slate-200 dark:border-white/10 py-2 z-50 animate-in fade-in zoom-in-95 duration-200">
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
                    </div>
                    <div className="px-4 py-3">
                        <label className="flex flex-col min-w-40 h-11 w-full">
                            <div className="flex w-full flex-1 items-stretch rounded-xl h-full bg-slate-200/50 dark:bg-[#2b2839]">
                                <div className="text-slate-500 dark:text-[#a19db9] flex items-center justify-center pl-4">
                                    <Search size={20} />
                                </div>
                                <input
                                    className="flex w-full min-w-0 flex-1 border-none bg-transparent focus:outline-0 focus:ring-0 text-base font-normal placeholder:text-slate-500 dark:placeholder:text-[#a19db9] px-3"
                                    placeholder="Search titles or paste URL..."
                                    value={searchQuery}
                                    id="search-input"
                                    name="search-query"
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    onKeyDown={handleSearch}
                                    disabled={isScraping}
                                />
                                {isScraping && (
                                    <div className="flex items-center pr-3">
                                        <div className="size-4 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
                                    </div>
                                )}
                            </div>
                        </label>
                    </div>
                </div>

                {/* Content */}
                <div className="flex flex-col gap-6">
                    {/* Trending Carousel */}
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center justify-between px-4">
                            <h3 className="text-lg font-bold tracking-tight">Trending Now</h3>
                            <button onClick={() => navigate('/discover/trending')} className="text-primary text-sm font-medium">See all</button>
                        </div>
                        <div className="carousel-container flex overflow-x-auto gap-4 px-4 hide-scrollbar snap-x snap-mandatory">
                            <div className="carousel-item flex-none w-[85%] aspect-[16/9] relative rounded-2xl overflow-hidden shadow-xl snap-center shrink-0">
                                <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url('https://lh3.googleusercontent.com/aida-public/AB6AXuDZydlsF0EBlvj4FEZ3_KK7ejHasIpT486aSZ0qzAjwhN3lHmTzE0CH1tnWn0-2ow2902zcUYIlIE119CUg202_e_IyaBpEqNzmgBTloHItF8Lfr7KORpP2z2leVgMY0ahLfcm7t-oJVbpwuW6sGrVMHdZvTZyCBubbco0Ig-sb1dNj85278IMRLSrHPOZ4VKGM7mvUejbcK9vGeMLJ0lAc7HMSU1WiUaIL1s9rUq_WMZfkmfMbfqQcXl22D5IBs9ubmEdtFtcUY_45')" }}></div>
                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>
                                <div className="absolute bottom-4 left-4 right-4">
                                    <span className="bg-primary text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider mb-2 inline-block">Top Scraped</span>
                                    <h4 className="text-white text-xl font-bold leading-tight">The Celestial Voyager</h4>
                                    <p className="text-white/70 text-sm line-clamp-1">Explore the edges of the galaxy in this epic saga.</p>
                                </div>
                            </div>
                            <div className="carousel-item flex-none w-[85%] aspect-[16/9] relative rounded-2xl overflow-hidden shadow-xl snap-center shrink-0">
                                <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url('https://lh3.googleusercontent.com/aida-public/AB6AXuBzh-LWsJshxaaCAMdHmV-5mQvos8o67jJPPTmOLPa0_UhVFjyYsXDPQjMYKOxCUbj4Icv2CGu_Vh8MTttM6bI2NjHJYTuD_DpC6oaPthsTRDmW2Z8s8yjhFtkbIWG3pUYH7Iy3bUCVeNw737EGBSzQnxu4dUFDlbmf4Nf0hTE6ZVId5ljffI9EoPEGTf0mOmQ6j-S-6Aj8bvteCxNxY_wgk7f_I3N3pjh3XnLk6bvtUyLURaWO7t6qeQVtDd9GbPYTyk0sIv8duC_d')" }}></div>
                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>
                                <div className="absolute bottom-4 left-4 right-4">
                                    <span className="bg-primary text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider mb-2 inline-block">Popular AI Audio</span>
                                    <h4 className="text-white text-xl font-bold leading-tight">Echoes of Silence</h4>
                                    <p className="text-white/70 text-sm line-clamp-1">A mystery that unravels the secrets of time.</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* New Scrapes / Recent Imports */}
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center justify-between px-4">
                            <h3 className="text-lg font-bold tracking-tight">New Scrapes</h3>
                            <button onClick={() => navigate('/discover/new')} className="text-primary text-sm font-medium">View More</button>
                        </div>
                        <div className="flex overflow-x-auto gap-4 px-4 hide-scrollbar">
                            {/* Static Examples + Real Data */}
                            <div className="flex-none w-32 flex flex-col gap-2" onClick={() => performQuickScrape('https://www.royalroad.com/fiction/12345/shadow-sovereign')}>
                                <div className="relative aspect-[2/3] w-full rounded-lg overflow-hidden shadow-md group">
                                    <div className="absolute inset-0 bg-cover bg-center transition-transform group-hover:scale-105" style={{ backgroundImage: "url('https://lh3.googleusercontent.com/aida-public/AB6AXuCqMhpovFMbIDIvjAvLuEpmjV6p3lnhb-dSmc0u78-E2zCds4k756d9rKSH0vJgP6WDJBdkk0JD9pduXAYH5aSSN_VSOaohE1boz5djkAmp9ao_kHJlZyqXGdiLVNsusEnBIreHlfZilwmsfS0EhepGhJ4d2_7HnidJlHpbfvHOdpt25jUDusxRC3WV-PBdTtA7a0DZy1hqMUCahI2S8XWL7jEa4Ru7xAco9e-Wt7-YI8QMhDSF059yAaDUADAAsrgHR4-otM7ZKaXa')" }}></div>
                                    <div className="absolute top-1 right-1 bg-black/60 backdrop-blur-sm text-white p-1 rounded-md">
                                        <Bolt size={14} />
                                    </div>
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Download className="text-white" />
                                    </div>
                                </div>
                                <div className="flex flex-col px-0.5">
                                    <p className="font-semibold text-[13px] line-clamp-1">Beyond the Nebula</p>
                                    <p className="text-slate-500 dark:text-[#a19db9] text-[10px] font-medium">Sci-Fi • 4.8★</p>
                                </div>
                            </div>

                            {/* Render actual recent scrapes from DB if any */}
                            {recentScrapes.map((novel) => (
                                <div key={novel.id} className="flex-none w-32 flex flex-col gap-2" onClick={() => navigate(`/novel/${novel.id}`)}>
                                    <div className="relative aspect-[2/3] w-full rounded-lg overflow-hidden shadow-md">
                                        {novel.coverUrl ? (
                                            <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url('${novel.coverUrl}')` }}></div>
                                        ) : (
                                            <div className="absolute inset-0 bg-slate-300 dark:bg-[#2b2839] flex items-center justify-center">
                                                <BookOpen className="text-4xl text-slate-400" />
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex flex-col px-0.5">
                                        <p className="font-semibold text-[13px] line-clamp-1">{novel.title}</p>
                                        <p className="text-slate-500 dark:text-[#a19db9] text-[10px] font-medium truncate">{novel.author || 'Unknown'}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Top Genres */}
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center justify-between px-4">
                            <h3 className="text-lg font-bold tracking-tight">Top Genres</h3>
                        </div>
                        <div className="flex overflow-x-auto gap-3 px-4 hide-scrollbar">
                            <div className="flex-none w-32 h-20 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-800 flex flex-col items-center justify-center shadow-lg active:scale-95 transition-transform cursor-pointer" onClick={() => navigate('/discover/fantasy')}>
                                <BookOpen className="text-white mb-1" />
                                <span className="text-white text-xs font-bold">Fantasy</span>
                            </div>
                            <div className="flex-none w-32 h-20 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-800 flex flex-col items-center justify-center shadow-lg active:scale-95 transition-transform cursor-pointer" onClick={() => navigate('/discover/sci-fi')}>
                                <Rocket className="text-white mb-1" />
                                <span className="text-white text-xs font-bold">Sci-Fi</span>
                            </div>
                            <div className="flex-none w-32 h-20 rounded-xl bg-gradient-to-br from-rose-600 to-pink-800 flex flex-col items-center justify-center shadow-lg active:scale-95 transition-transform cursor-pointer" onClick={() => navigate('/discover/romance')}>
                                <Heart className="text-white mb-1" />
                                <span className="text-white text-xs font-bold">Romance</span>
                            </div>
                            <div className="flex-none w-32 h-20 rounded-xl bg-gradient-to-br from-amber-600 to-orange-800 flex flex-col items-center justify-center shadow-lg active:scale-95 transition-transform cursor-pointer" onClick={() => navigate('/discover/action')}>
                                <Swords className="text-white mb-1" />
                                <span className="text-white text-xs font-bold">Action</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <Navbar />
        </div>
    );
};
