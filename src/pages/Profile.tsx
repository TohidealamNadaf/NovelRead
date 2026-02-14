
import { useState, useEffect } from 'react';
import { BookOpen, Headphones, History, Settings, Shield, Edit, Check, Camera, Loader2 } from 'lucide-react';
import { FooterNavigation } from '../components/FooterNavigation';
import { Header } from '../components/Header';
import { dbService } from '../services/db.service';
import { useNavigate } from 'react-router-dom';
import { Camera as CapCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Preferences } from '@capacitor/preferences';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';

export const Profile = () => {
    const navigate = useNavigate();
    const [stats, setStats] = useState({ chaptersRead: 0, novelsCount: 0 });
    const [isEditing, setIsEditing] = useState(false);
    const [profileName, setProfileName] = useState("Reader");
    const [profileImage, setProfileImage] = useState("https://img.freepik.com/free-psd/3d-illustration-person-with-sunglasses_23-2149436188.jpg");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        await Promise.all([loadStats(), loadProfile()]);
        setLoading(false);
    };

    const loadProfile = async () => {
        try {
            const { value: savedName } = await Preferences.get({ key: 'profileName' });
            const { value: savedImage } = await Preferences.get({ key: 'profileImage' });

            if (savedName) setProfileName(savedName);
            // If savedImage is a filepath, we might need to read it, but usually for web/hybrid 
            // we store DataURLs or utilize capacitor:// URLs. 
            // For simplicity and performance, if it's a dataUrl we just set it.
            // If we stored a path, we would convert to web path.
            if (savedImage) setProfileImage(savedImage);
        } catch (e) {
            console.error("Failed to load profile", e);
        }
    };

    const saveProfile = async (name: string, image: string) => {
        try {
            if (!name.trim()) return; // Validation
            await Preferences.set({ key: 'profileName', value: name });

            // If image is a huge dataURL, we might want to save to filesystem, 
            // but for simplicity in this refactor step, we'll keep using Preferences/Storage 
            // as DataURL unless the user explicitly requested Filesystem.
            // The prompt "Store profile image using Capacitor Filesystem" IS a requirement.

            let imageToStore = image;
            if (image.startsWith('data:')) {
                const fileName = `profile_${new Date().getTime()}.jpg`;
                try {
                    const savedFile = await Filesystem.writeFile({
                        path: fileName,
                        data: image,
                        directory: Directory.Data,
                    });
                    // distinct handling for web vs native would be needed here for reading back
                    // For now, let's store the dataUrl in Preferences as a fallback or 
                    // if on web. Real filesystem implementation requires `Capacitor.convertFileSrc`
                    // on read. To ensure stability without detailed environment check, 
                    // I will stick to Preferences for now and implement Filesystem only if I'm sure 
                    // about the read-back logic for the 'src' attribute.
                    // RE-READ REQUIREMENTS: "Store profile image using Capacitor Filesystem and only persist file path in Preferences."
                    // Okay, I will implement it.
                    // On Native, we store the file path. On Web, we must use the DataURL.
                    if (Capacitor.getPlatform() !== 'web') {
                        imageToStore = savedFile.uri;
                    }
                } catch (fsError) {
                    console.error("Filesystem write failed, falling back to dataUrl", fsError);
                }
            }

            await Preferences.set({ key: 'profileImage', value: imageToStore });

            // Sync with other components via localStorage and event
            localStorage.setItem('profileImage', imageToStore);
            window.dispatchEvent(new CustomEvent('profile-updated', { detail: imageToStore }));

        } catch (e) {
            console.error("Failed to save profile", e);
        }
    };

    const loadStats = async () => {
        try {
            const data = await dbService.getStats();
            setStats(data);
        } catch (e) {
            console.error("Failed to load stats", e);
        }
    };

    // Helper to process image for display
    const getDisplayImage = (src: string) => {
        if (!src) return "https://img.freepik.com/free-psd/3d-illustration-person-with-sunglasses_23-2149436188.jpg";
        if (src.startsWith('file://')) {
            return Capacitor.convertFileSrc(src);
        }
        return src;
    }

    const handleCamera = async () => {
        try {
            const image = await CapCamera.getPhoto({
                quality: 90,
                allowEditing: true,
                resultType: CameraResultType.DataUrl, // Get DataURL first to write to file
                source: CameraSource.Prompt,
                promptLabelHeader: 'Change Profile Photo',
                promptLabelPhoto: 'Choose from Gallery',
                promptLabelPicture: 'Take Photo'
            });

            if (image.dataUrl) {
                // Determine logic: We display the dataUrl immediately for UX
                setProfileImage(image.dataUrl);
                // We save it (which will write to file and save path)
                await saveProfile(profileName, image.dataUrl);
            }
        } catch (e) {
            console.error("Camera cancelled or failed", e);
        }
    };

    return (
        <div className="bg-background-dark text-white h-screen flex flex-col font-sans">
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
                        <div className="size-28 shrink-0 rounded-full ring-4 ring-primary/20 shadow-2xl bg-slate-800 overflow-hidden">
                            {/* Image */}
                            {/* Use a callback or effect to handle async file src conversion if needed, 
                                 but Capacitor.convertFileSrc is synchronous usually. 
                                 We need to import Capacitor from core though. */}
                            <img
                                src={getDisplayImage(profileImage)}
                                alt="Profile"
                                className="size-full object-cover"
                                onError={(e) => {
                                    (e.target as HTMLImageElement).src = "https://img.freepik.com/free-psd/3d-illustration-person-with-sunglasses_23-2149436188.jpg";
                                }}
                            />
                        </div>

                        {isEditing ? (
                            <button
                                onClick={handleCamera}
                                className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full cursor-pointer hover:bg-black/50 transition-colors animate-in fade-in"
                            >
                                <Camera className="text-white" size={24} />
                            </button>
                        ) : (
                            <button
                                onClick={() => setIsEditing(true)}
                                className="absolute bottom-0 right-0 size-9 bg-primary rounded-full flex items-center justify-center border-2 border-background-dark shadow-lg active:scale-95 transition-transform"
                            >
                                <Edit size={16} />
                            </button>
                        )}
                    </div>

                    {isEditing ? (
                        <div className="mt-4 flex items-center gap-2 animate-in slide-in-from-bottom-2">
                            <input
                                value={profileName}
                                onChange={(e) => setProfileName(e.target.value.slice(0, 30))} // Max 30 chars
                                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1 text-lg font-bold text-center outline-none focus:border-primary w-48"
                                autoFocus
                                placeholder="Enter Name"
                            />
                            <button
                                onClick={() => {
                                    if (profileName.trim().length > 0) {
                                        setIsEditing(false);
                                        saveProfile(profileName, profileImage);
                                    } else {
                                        alert("Name cannot be empty");
                                    }
                                }}
                                className="size-9 rounded-full bg-green-500/20 text-green-500 flex items-center justify-center hover:bg-green-500/30 transition-colors"
                            >
                                <Check size={18} />
                            </button>
                        </div>
                    ) : (
                        <h1 className="mt-4 text-2xl font-bold">{profileName}</h1>
                    )}
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-4 px-4 pb-6">
                    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-white/5 bg-[#121118] p-5 shadow-sm hover:bg-white/5 transition-colors">
                        <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <BookOpen size={24} />
                        </div>
                        <div className="text-center">
                            {loading ? (
                                <Loader2 className="animate-spin size-6 text-slate-500 mx-auto" />
                            ) : (
                                <p className="text-xl font-bold leading-tight">{stats.chaptersRead}</p>
                            )}
                            <p className="text-slate-400 text-[11px] font-medium uppercase tracking-wider mt-1">Chapters Read</p>
                        </div>
                    </div>
                    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-white/5 bg-[#121118] p-5 shadow-sm hover:bg-white/5 transition-colors">
                        <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <Headphones size={24} />
                        </div>
                        <div className="text-center">
                            {loading ? (
                                <Loader2 className="animate-spin size-6 text-slate-500 mx-auto" />
                            ) : (
                                <p className="text-xl font-bold leading-tight">{stats.novelsCount}</p>
                            )}
                            <p className="text-slate-400 text-[11px] font-medium uppercase tracking-wider mt-1">Novels Added</p>
                        </div>
                    </div>
                </div>

                {/* Settings List */}
                <div className="px-4 flex flex-col gap-3 pb-8">
                    <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-widest px-1 mb-1">Settings & History</h3>

                    <button onClick={() => navigate('/history')} className="group flex items-center justify-between w-full p-4 rounded-xl border border-white/5 bg-[#121118] hover:bg-white/5 transition-all active:scale-[0.99]">
                        <div className="flex items-center gap-3">
                            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-slate-300 group-hover:bg-primary group-hover:text-white transition-colors">
                                <History size={20} />
                            </div>
                            <div className="text-left">
                                <p className="font-semibold text-sm">Scraping History</p>
                                <p className="text-slate-500 text-[11px]">Manage your AI-scraped novels</p>
                            </div>
                        </div>
                        <div className="text-slate-500 group-hover:translate-x-1 transition-transform">{'>'}</div>
                    </button>

                    <button onClick={() => navigate('/settings')} className="group flex items-center justify-between w-full p-4 rounded-xl border border-white/5 bg-[#121118] hover:bg-white/5 transition-all active:scale-[0.99]">
                        <div className="flex items-center gap-3">
                            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-slate-300 group-hover:bg-primary group-hover:text-white transition-colors">
                                <Settings size={20} />
                            </div>
                            <div className="text-left">
                                <p className="font-semibold text-sm">App Settings</p>
                                <p className="text-slate-500 text-[11px]">Audio, appearance & storage</p>
                            </div>
                        </div>
                        <div className="text-slate-500 group-hover:translate-x-1 transition-transform">{'>'}</div>
                    </button>

                    <button onClick={() => navigate('/privacy')} className="group flex items-center justify-between w-full p-4 rounded-xl border border-white/5 bg-[#121118] hover:bg-white/5 transition-all active:scale-[0.99]">
                        <div className="flex items-center gap-3">
                            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-slate-300 group-hover:bg-primary group-hover:text-white transition-colors">
                                <Shield size={20} />
                            </div>
                            <div className="text-left">
                                <p className="font-semibold text-sm">Privacy & Security</p>
                                <p className="text-slate-500 text-[11px]">Secure your reading data</p>
                            </div>
                        </div>
                        <div className="text-slate-500 group-hover:translate-x-1 transition-transform">{'>'}</div>
                    </button>

                </div>
            </div>
            <FooterNavigation />
        </div>
    );
};

