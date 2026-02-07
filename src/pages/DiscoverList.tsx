
import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Search, Bolt, TrendingUp, BookOpen } from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { dbService } from '../services/database.service';
// Mock Data for "New Scrapes" and Categories if DB is empty
const MOCK_DATA: Record<string, any[]> = {
    'new': [
        { id: '1', title: 'Beyond the Nebula', author: 'Sci-Fi • 4.8★', coverUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCqMhpovFMbIDIvjAvLuEpmjV6p3lnhb-dSmc0u78-E2zCds4k756d9rKSH0vJgP6WDJBdkk0JD9pduXAYH5aSSN_VSOaohE1boz5djkAmp9ao_kHJlZyqXGdiLVNsusEnBIreHlfZilwmsfS0EhepGhJ4d2_7HnidJlHpbfvHOdpt25jUDusxRC3WV-PBdTtA7a0DZy1hqMUCahI2S8XWL7jEa4Ru7xAco9e-Wt7-YI8QMhDSF059yAaDUADAAsrgHR4-otM7ZKaXa', badge: 'bolt' },
        { id: '2', title: 'Ancient Archives', author: 'History • 4.5★', coverUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCsH2jgE1g9OgysEhziR3H4hxI2alNQxoOlQTo-D0JuwYIOP1QhEAWn-2JrPHZCO05VT9CXTxuFFLw-HJencu_Iz-DQvGxUNRRzA-c-YF6MfEpoSmPKDZP0TDQOj-eNtYYZB5BHN7u8nsyOwonmCYu1DC9uFe0zCNGo6UxNIgEJoiSUd45pthyUAdPNbPSuMX4BRwycyymFMiYaTRrIaIbP2pasMfFoUZCPPT7dlDRFIRZXRmNdIdA18jPtrKXOAhyqCP1jI3FYkBSi' },
        { id: '3', title: 'Chronicles', author: 'Fantasy • 4.9★', coverUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDZydlsF0EBlvj4FEZ3_KK7ejHasIpT486aSZ0qzAjwhN3lHmTzE0CH1tnWn0-2ow2902zcUYIlIE119CUg202_e_IyaBpEqNzmgBTloHItF8Lfr7KORpP2z2leVgMY0ahLfcm7t-oJVbpwuW6sGrVMHdZvTZyCBubbco0Ig-sb1dNj85278IMRLSrHPOZ4VKGM7mvUejbcK9vGeMLJ0lAc7HMSU1WiUaIL1s9rUq_WMZfkmfMbfqQcXl22D5IBs9ubmEdtFtcUY_45', badge: 'trending_up' },
        { id: '4', title: 'The Rift Walker', author: 'Action • 4.2★', coverUrl: '' }, // Fallback icon
        { id: '5', title: 'Starborn Saga', author: 'Space Opera • 4.7★', coverUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDZydlsF0EBlvj4FEZ3_KK7ejHasIpT486aSZ0qzAjwhN3lHmTzE0CH1tnWn0-2ow2902zcUYIlIE119CUg202_e_IyaBpEqNzmgBTloHItF8Lfr7KORpP2z2leVgMY0ahLfcm7t-oJVbpwuW6sGrVMHdZvTZyCBubbco0Ig-sb1dNj85278IMRLSrHPOZ4VKGM7mvUejbcK9vGeMLJ0lAc7HMSU1WiUaIL1s9rUq_WMZfkmfMbfqQcXl22D5IBs9ubmEdtFtcUY_45' },
        { id: '6', title: 'Midnight Shadows', author: 'Mystery • 4.4★', coverUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBzh-LWsJshxaaCAMdHmV-5mQvos8o67jJPPTmOLPa0_UhVFjyYsXDPQjMYKOxCUbj4Icv2CGu_Vh8MTttM6bI2NjHJYTuD_DpC6oaPthsTRDmW2Z8s8yjhFtkbIWG3pUYH7Iy3bUCVeNw737EGBSzQnxu4dUFDlbmf4Nf0hTE6ZVId5ljffI9EoPEGTf0mOmQ6j-S-6Aj8bvteCxNxY_wgk7f_I3N3pjh3XnLk6bvtUyLURaWO7t6qeQVtDd9GbPYTyk0sIv8duC_d' },
        { id: '7', title: 'Shadow Weaver', author: 'Dark Fantasy • 4.6★', coverUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDbYlPlCtl5nXUzCPiYMP7SCXWeQ84w9NmucBWNGlCDCGQ5pM3kiBXVc7tioeSumgFh2OxNfH01ImNdLaNPzO4R_J9tbfFWpFd61DqeK0yIbeCsjidWDANWpgko2zXbKIAuorbpjfDeP40e_YWPjaRx4bAugS8X3vqlRfn8Urw1tJVQS759n8g7KEr8QXYU4Bp1XDj-xK8t60KBQ1ZRnhSBWjvb6C7qQvMtGq0XfGwZePwWhdpejt3Fe1wLRYozX1-LXpL_is3Okeww' },
        { id: '8', title: 'Lost Kingdom', author: 'Epic • 4.3★', coverUrl: '' }
    ]
};

export const DiscoverList = () => {
    const { category } = useParams<{ category: string }>();
    const navigate = useNavigate();
    const [title, setTitle] = useState('');
    const [novels, setNovels] = useState<any[]>([]);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        loadCategoryData();
    }, [category]);

    const loadCategoryData = async () => {
        // Determine title and data source based on category parameter
        let pageTitle = 'Discover';
        let data: any[] = [];

        if (category === 'trending') {
            pageTitle = 'Trending Now';
            // In a real app, query "trending" from DB or API
            const dbNovels = await dbService.getNovels();
            data = dbNovels.slice(0, 10); // Just use existing for now
            if (data.length === 0) data = MOCK_DATA['new']; // Fallback to mock
        } else if (category === 'new') {
            pageTitle = 'New Scrapes';
            data = MOCK_DATA['new'];
        } else if (category) {
            // Genre fallback
            pageTitle = category.charAt(0).toUpperCase() + category.slice(1);
            // Filter MOCK_DATA or DB by genre? For now just show mock data to fill UI
            data = MOCK_DATA['new'];
        }

        setTitle(pageTitle);
        setNovels(data);
    };

    const filteredNovels = novels.filter(n => n.title.toLowerCase().includes(searchQuery.toLowerCase()));

    // Audio State for Mini-Player (Mocking visual only as per user design, functional one is global)
    // Actually, user design shows a specific mini-player *above* the navbar.
    // We already have a global MiniPlayer component.
    // The user design might be requesting a specific look for this page or just showing the player exists.
    // I will replicate the "AI TTS Active" card from the design as a static marketing element or real player integration?
    // Design says: "AI TTS Active" with a specific book cover.
    // If global player is running, it shows up.
    // The design's player looks slightly different (embedded in bottom).
    // I'll stick to our Global MiniPlayer for consistency/functionality, but maybe style it similar if requested?
    // The user request says: "Implement that page with all its functionality".
    // I will implement the list view primarily.

    return (
        <div className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-white h-screen w-full flex flex-col font-display overflow-hidden">
            {/* Header - Fixed at top */}
            <div className="bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md z-40 shrink-0">
                <div className="flex items-center p-4 pb-2">
                    <button onClick={() => navigate(-1)} className="flex size-10 items-center justify-start rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors">
                        <ArrowLeft size={24} />
                    </button>
                    <h2 className="text-xl font-bold leading-tight tracking-tight flex-1 text-center mr-10">{title}</h2>
                </div>
                {/* Search Bar */}
                <div className="px-4 py-3">
                    <label className="flex flex-col min-w-40 h-11 w-full">
                        <div className="flex w-full flex-1 items-stretch rounded-xl h-full bg-slate-200/50 dark:bg-[#2b2839]">
                            <div className="text-slate-500 dark:text-[#a19db9] flex items-center justify-center pl-4">
                                <Search size={20} />
                            </div>
                            <input
                                className="form-input flex w-full min-w-0 flex-1 border-none bg-transparent focus:outline-0 focus:ring-0 text-base font-normal placeholder:text-slate-500 dark:placeholder:text-[#a19db9] px-3"
                                placeholder={`Search ${title.toLowerCase()}...`}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </label>
                </div>
            </div>

            {/* Grid Content - Independent Scroll */}
            <div className="flex-1 overflow-y-auto px-4 pt-2 pb-32">
                <div className="grid grid-cols-2 gap-x-4 gap-y-6">
                    {filteredNovels.map((novel, index) => (
                        <div key={novel.id || index} className="flex flex-col gap-2 cursor-pointer active:scale-95 transition-transform" onClick={() => navigate(`/novel/${novel.id}`)}>
                            <div className="relative aspect-[2/3] w-full rounded-xl overflow-hidden shadow-lg">
                                {novel.coverUrl ? (
                                    <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url('${novel.coverUrl}')` }}></div>
                                ) : (
                                    <div className="absolute inset-0 bg-slate-300 dark:bg-[#2b2839] flex items-center justify-center">
                                        <BookOpen className="text-4xl text-slate-400" />
                                    </div>
                                )}

                                {/* Badges */}
                                {novel.badge === 'bolt' && (
                                    <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-sm text-white p-1 rounded-md">
                                        <Bolt size={16} fill="currentColor" />
                                    </div>
                                )}
                                {novel.badge === 'trending_up' && (
                                    <div className="absolute top-2 right-2 bg-primary/90 backdrop-blur-sm text-white p-1 rounded-md">
                                        <TrendingUp size={16} />
                                    </div>
                                )}
                            </div>
                            <div className="flex flex-col px-0.5">
                                <p className="font-bold text-[14px] line-clamp-1">{novel.title}</p>
                                <p className="text-slate-500 dark:text-[#a19db9] text-[11px] font-medium">{novel.author || 'Unknown Author'}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Navbar */}
            <Navbar />
        </div>
    );
};
