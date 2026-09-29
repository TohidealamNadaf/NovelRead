import { useState, useEffect } from 'react';
import { History, Settings, Shield, Edit, Check, Camera } from 'lucide-react';
import { FooterNavigation } from '../components/FooterNavigation';
import { Header } from '../components/Header';
import { dbService, type ReadingStatistics } from '../services/db.service';
import { useNavigate } from 'react-router-dom';
import { Camera as CapCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Preferences } from '@capacitor/preferences';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { useProfileImage } from '../hooks/useProfileImage';
import { DEFAULT_AVATAR } from '../utils/profileImage.util';
import { ReadingStatsCard } from '../components/profile';

export const Profile = () => {
    const navigate = useNavigate();
    const [stats, setStats] = useState<ReadingStatistics>({
        chaptersRead: 0,
        novelsCount: 0,
        totalReadingTimeMinutes: 0,
        currentStreakDays: 0,
        last7Days: []
    });
    const [isEditing, setIsEditing] = useState(false);
    const [profileName, setProfileName] = useState('Reader');
    const profileImage = useProfileImage(); // ← single source of truth
    const [loading, setLoading] = useState(true);

    const loadProfile = async () => {
        const { value: savedName } = await Preferences.get({ key: 'profileName' });
        if (savedName) setProfileName(savedName);
    };

    const loadStats = async () => {
        try { setStats(await dbService.getReadingStats()); }
        catch (e) { console.error(e); }
    };

    const loadData = useCallback(async () => {
        setLoading(true);
        await Promise.all([loadStats(), loadProfile()]);
        setLoading(false);
    }, []);

    useEffect(() => { 
        loadData(); 
    }, [loadData]);

    const saveProfile = async (name: string, image: string) => {
        if (!name.trim()) return;
        await Preferences.set({ key: 'profileName', value: name });
        await Preferences.set({ key: 'profileImage', value: image });
        localStorage.setItem('profileImage', image);
        localStorage.setItem('profileName', name);
        window.dispatchEvent(new CustomEvent('profile-updated', { detail: image }));
    };

    const loadStats = async () => {
        try { setStats(await dbService.getReadingStats()); }
        catch (e) { console.error(e); }
    };

    const handleCamera = async () => {
        try {
            const useUri = Capacitor.getPlatform() !== 'web';
            const image = await CapCamera.getPhoto({
                quality: 80,
                allowEditing: true,
                resultType: useUri ? CameraResultType.Uri : CameraResultType.DataUrl,
                source: CameraSource.Prompt,
                width: 512, height: 512 // ← resize, saves space
            });

            let imageToStore: string;
            if (useUri && image.path) {
                // Copy native file into persistent app Data dir
                const fileName = 'profile.jpg';
                try {
                    // Strip file:// prefix if present (Filesystem wants raw path on Android)
                    const cleanPath = image.path.replace(/^file:\/\//, '');
                    const fileData = await Filesystem.readFile({ path: cleanPath });
                    await Filesystem.writeFile({ path: fileName, data: fileData.data, directory: Directory.Data });
                    const { uri } = await Filesystem.getUri({ path: fileName, directory: Directory.Data });
                    imageToStore = uri; // content:// or file://
                } catch (fsErr) {
                    console.error('[Profile] FS copy failed, storing temp path', fsErr);
                    imageToStore = image.path; // fallback: still displays now, may not survive cache clear
                }
            } else if (image.dataUrl) {
                imageToStore = image.dataUrl;
            } else {
                return;
            }

            await saveProfile(profileName, imageToStore);
        } catch (e) {
            console.error('Photo selection failed', e);
        }
    };

    return (
        <div className="bg-background-dark text-white h-screen flex flex-col font-sans">
            <Header title="Profile" rightActions={
                <button onClick={() => navigate('/settings')} className="p-2 rounded-full hover:bg-white/10">
                    <Settings size={20} />
                </button>
            } />

            <div className="flex-1 overflow-y-auto w-full pb-24">
                <div className="flex flex-col items-center px-4 py-8">
                    <div className="relative group">
                        <div className="size-28 rounded-full ring-4 ring-primary/20 shadow-2xl bg-slate-800 overflow-hidden">
                            <img
                                src={profileImage}
                                alt="Profile"
                                className="size-full object-cover"
                                onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_AVATAR; }}
                            />
                        </div>
                        {isEditing ? (
                            <button onClick={handleCamera}
                                className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full hover:bg-black/50">
                                <Camera className="text-white" size={24} />
                            </button>
                        ) : (
                            <button onClick={() => setIsEditing(true)}
                                className="absolute bottom-0 right-0 size-9 bg-primary rounded-full flex items-center justify-center border-2 border-background-dark shadow-lg active:scale-95">
                                <Edit size={16} />
                            </button>
                        )}
                    </div>

                    {isEditing ? (
                        <div className="mt-4 flex items-center gap-2">
                            <input value={profileName}
                                onChange={(e) => setProfileName(e.target.value.slice(0, 30))}
                                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1 text-lg font-bold text-center outline-none focus:border-primary w-48"
                                autoFocus placeholder="Enter Name" />
                            <button onClick={() => {
                                if (profileName.trim()) { setIsEditing(false); saveProfile(profileName, profileImage); }
                                else alert('Name cannot be empty');
                            }} className="size-9 rounded-full bg-green-500/20 text-green-500 flex items-center justify-center">
                                <Check size={18} />
                            </button>
                        </div>
                    ) : (
                        <h1 className="mt-4 text-2xl font-bold">{profileName}</h1>
                    )}
                </div>

                {/* Reading Stats & Streak */}
                <ReadingStatsCard stats={stats} loading={loading} />

                {/* Settings List */}
                <div className="px-4 flex flex-col gap-3 pb-8">
                    <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-widest px-1 mb-1">Settings & History</h3>
                    {[
                        { icon: History, label: 'Scraping History', sub: 'Manage your AI-scraped novels', to: '/history' },
                        { icon: Settings, label: 'App Settings', sub: 'Audio, appearance & storage', to: '/settings' },
                        { icon: Shield, label: 'Privacy & Security', sub: 'Secure your reading data', to: '/privacy' },
                    ].map(({ icon: Icon, label, sub, to }) => (
                        <button key={to} onClick={() => navigate(to)}
                            className="group flex items-center justify-between w-full p-4 rounded-xl border border-white/5 bg-[#121118] hover:bg-white/5 active:scale-[0.99]">
                            <div className="flex items-center gap-3">
                                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-slate-300 group-hover:bg-primary group-hover:text-white transition-colors">
                                    <Icon size={20} />
                                </div>
                                <div className="text-left">
                                    <p className="font-semibold text-sm">{label}</p>
                                    <p className="text-slate-500 text-[11px]">{sub}</p>
                                </div>
                            </div>
                            <div className="text-slate-500 group-hover:translate-x-1 transition-transform">{'>'}</div>
                        </button>
                    ))}
                </div>
            </div>
            <FooterNavigation />
        </div>
    );
};
