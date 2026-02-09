
import { useState, useEffect } from 'react';
import { BookOpen, Headphones, History, Settings, Shield, Edit, Check, Camera } from 'lucide-react';
import { FooterNavigation } from '../components/FooterNavigation';
import { Header } from '../components/Header';
import { dbService } from '../services/db.service';
import { useNavigate } from 'react-router-dom';
import { Camera as CapCamera, CameraResultType, CameraSource } from '@capacitor/camera';

export const Profile = () => {
    const navigate = useNavigate();
    const [stats, setStats] = useState({ chaptersRead: 0, novelsCount: 0 });
    const [isEditing, setIsEditing] = useState(false);
    const [profileName, setProfileName] = useState("Tohid Nadaf");
    const [profileImage, setProfileImage] = useState("https://lh3.googleusercontent.com/aida-public/AB6AXuDjCOham51YfTM7PcgkgKspU9PvDHuom_3rGeCzHDOnhZnOzp09BhpYTuEnobo9LY8vOsfLsujPy9_QEMQ7WaQQSrFMdLgnji7T5irQ-C7DSmSq-0RKsDtEHLdFk2Jd7O9Qpw1VCPG_71gSZCD9ROyRef4a9hy1bzxv5Kmeyh5eiAx9wKqIXAtSkLrqYxyMQFSb2RIi6syEVabDEHarMZ8ece6wHlOJW3ky5o3LtKvE3JC2EZaJpRlwT5R61uO6G-mUqtqV5qNjIYyE");

    useEffect(() => {
        loadStats();
        loadProfile();
    }, []);

    const loadProfile = () => {
        const savedName = localStorage.getItem('profileName');
        const savedImage = localStorage.getItem('profileImage');
        if (savedName) setProfileName(savedName);
        if (savedImage) setProfileImage(savedImage);
    };

    const saveProfile = (name: string, image: string) => {
        localStorage.setItem('profileName', name);
        localStorage.setItem('profileImage', image);
    };

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
        <div className="bg-background-dark text-white min-h-screen font-sans flex flex-col">
            {/* Header */}
            {/* Header */}
            <Header
                title="Profile"
                rightActions={
                    <button onClick={() => navigate('/settings')} className="flex items-center justify-center p-2 rounded-full hover:bg-white/10 transition-colors">
                        <Settings size={20} />
                    </button>
                }
            />

            <div className="flex-1 overflow-y-auto w-full pb-24">
                <div className="flex flex-col items-center px-4 py-8">
                    <div className="relative group">
                        <div className="size-28 shrink-0 items-center overflow-hidden rounded-full ring-4 ring-primary/20 shadow-2xl">
                            <div className="bg-center bg-no-repeat aspect-square bg-cover size-full" style={{ backgroundImage: `url('${profileImage}')` }}></div>
                        </div>
                        {isEditing && (
                            <button
                                onClick={async () => {
                                    try {
                                        const image = await CapCamera.getPhoto({
                                            quality: 90,
                                            allowEditing: true,
                                            resultType: CameraResultType.DataUrl,
                                            source: CameraSource.Photos
                                        });
                                        if (image.dataUrl) {
                                            setProfileImage(image.dataUrl);
                                            saveProfile(profileName, image.dataUrl);
                                        }
                                    } catch (e) {
                                        console.error("Camera error", e);
                                        // Fallback if camera fails
                                        const url = prompt("Enter new image URL:", profileImage);
                                        if (url) {
                                            setProfileImage(url);
                                            saveProfile(profileName, url);
                                        }
                                    }
                                }}
                                className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full cursor-pointer hover:bg-black/50 transition-colors"
                            >
                                <Camera className="text-white" size={24} />
                            </button>
                        )}
                        {!isEditing && (
                            <button
                                onClick={() => setIsEditing(true)}
                                className="absolute bottom-0 right-0 size-8 bg-primary rounded-full flex items-center justify-center border-2 border-background-dark shadow-lg active:scale-95 transition-transform"
                            >
                                <Edit size={14} />
                            </button>
                        )}
                    </div>

                    {isEditing ? (
                        <div className="mt-4 flex items-center gap-2">
                            <input
                                value={profileName}
                                onChange={(e) => setProfileName(e.target.value)}
                                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1 text-lg font-bold text-center outline-none focus:border-primary w-40"
                                autoFocus
                            />
                            <button
                                onClick={() => {
                                    setIsEditing(false);
                                    saveProfile(profileName, profileImage);
                                }}
                                className="size-8 rounded-full bg-green-500/20 text-green-500 flex items-center justify-center hover:bg-green-500/30"
                            >
                                <Check size={16} />
                            </button>
                        </div>
                    ) : (
                        <h1 className="mt-4 text-2xl font-bold">{profileName}</h1>
                    )}
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
                <div className="px-4 flex flex-col gap-3 pb-8">
                    <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-widest px-1">Settings & History</h3>

                    <button onClick={() => navigate('/history')} className="group flex items-center justify-between w-full p-4 rounded-xl border border-white/5 bg-[#121118] hover:bg-white/5 transition-all">
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

                    <button onClick={() => navigate('/settings')} className="group flex items-center justify-between w-full p-4 rounded-xl border border-white/5 bg-[#121118] hover:bg-white/5 transition-all">
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

                    <button onClick={() => navigate('/privacy')} className="group flex items-center justify-between w-full p-4 rounded-xl border border-white/5 bg-[#121118] hover:bg-white/5 transition-all">
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

                </div>
            </div>
            <FooterNavigation />
        </div>
    );
};
