import { useState, useEffect } from 'react';
import { History, Settings, Shield, Edit2, Check, Camera, Loader2, Sparkles } from 'lucide-react';
import { FooterNavigation } from '../components/FooterNavigation';
import { Header } from '../components/Header';
import { dbService, type ReadingStatistics } from '../services/db.service';
import { useNavigate } from 'react-router-dom';
import { Camera as CapCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Preferences } from '@capacitor/preferences';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { useProfileImage } from '../hooks/useProfileImage';
import { DEFAULT_AVATAR } from '../utils/profileImage.util';
import { ReadingStatsCard, AvatarPickerSheet, PresetAvatarModal } from '../components/profile';

export const Profile = () => {
    const navigate = useNavigate();
    const [stats, setStats] = useState<ReadingStatistics>({
        chaptersRead: 0,
        novelsCount: 0,
        totalReadingTimeMinutes: 0,
        currentStreakDays: 0,
        last7Days: []
    });
    const [isEditingName, setIsEditingName] = useState(false);
    const [profileName, setProfileName] = useState('Reader');
    const [nameError, setNameError] = useState<string | null>(null);
    const profileImage = useProfileImage(); // single source of truth
    const [loading, setLoading] = useState(true);
    const [isProcessingImage, setIsProcessingImage] = useState(false);

    // Modal & Sheet state
    const [isPickerSheetOpen, setIsPickerSheetOpen] = useState(false);
    const [isPresetModalOpen, setIsPresetModalOpen] = useState(false);

    useEffect(() => { 
        let isMounted = true;
        const fetchData = async () => {
            try {
                const [savedName, readStats] = await Promise.all([
                    Preferences.get({ key: 'profileName' }),
                    dbService.getReadingStats().catch(() => null)
                ]);
                if (isMounted) {
                    if (savedName?.value) setProfileName(savedName.value);
                    if (readStats) setStats(readStats);
                    setLoading(false);
                }
            } catch (err) {
                console.error('Failed to load profile data', err);
                if (isMounted) setLoading(false);
            }
        };
        fetchData();
        return () => { isMounted = false; };
    }, []);

    const triggerHaptic = async (type: 'light' | 'success' | 'error' = 'light') => {
        try {
            if (type === 'light') {
                await Haptics.impact({ style: ImpactStyle.Light });
            } else if (type === 'success') {
                await Haptics.notification({ type: NotificationType.Success });
            } else if (type === 'error') {
                await Haptics.notification({ type: NotificationType.Error });
            }
        } catch {
            // Web environment fallback
        }
    };

    const saveProfileImage = async (imageValue: string) => {
        await Preferences.set({ key: 'profileImage', value: imageValue });
        localStorage.setItem('profileImage', imageValue);
        window.dispatchEvent(new CustomEvent('profile-updated', { detail: imageValue }));
    };

    const handleSaveName = async () => {
        const trimmed = profileName.trim();
        if (!trimmed) {
            setNameError('Name cannot be empty');
            triggerHaptic('error');
            return;
        }

        setNameError(null);
        setIsEditingName(false);
        triggerHaptic('success');

        await Preferences.set({ key: 'profileName', value: trimmed });
        localStorage.setItem('profileName', trimmed);
    };

    // Clean up old avatar files in native Directory.Data to prevent disk leaks
    const cleanOldNativeAvatar = async () => {
        if (Capacitor.getPlatform() === 'web') return;
        try {
            const { files } = await Filesystem.readdir({
                path: '',
                directory: Directory.Data
            });
            for (const file of files) {
                const fileName = typeof file === 'string' ? file : file.name;
                if (fileName.startsWith('profile_') && fileName.endsWith('.jpg')) {
                    await Filesystem.deleteFile({
                        path: fileName,
                        directory: Directory.Data
                    }).catch(() => {});
                }
            }
        } catch (e) {
            console.warn('[Profile] Old avatar cleanup skipped', e);
        }
    };

    const handlePhotoSelection = async (source: CameraSource) => {
        try {
            setIsProcessingImage(true);
            const useUri = Capacitor.getPlatform() !== 'web';
            const image = await CapCamera.getPhoto({
                quality: 85,
                allowEditing: true,
                resultType: useUri ? CameraResultType.Uri : CameraResultType.DataUrl,
                source,
                width: 512,
                height: 512,
            });

            let imageToStore: string;
            if (useUri && image.path) {
                // Delete previous stored avatar file first
                await cleanOldNativeAvatar();

                // Save with timestamped unique file name to bypass WebView cache lock
                const newFileName = `profile_${Date.now()}.jpg`;
                try {
                    const cleanPath = image.path.replace(/^file:\/\//, '');
                    const fileData = await Filesystem.readFile({ path: cleanPath });
                    await Filesystem.writeFile({
                        path: newFileName,
                        data: fileData.data,
                        directory: Directory.Data
                    });
                    const { uri } = await Filesystem.getUri({
                        path: newFileName,
                        directory: Directory.Data
                    });
                    imageToStore = uri;
                } catch (fsErr) {
                    console.error('[Profile] Filesystem write failed, using original path', fsErr);
                    imageToStore = image.path;
                }
            } else if (image.dataUrl) {
                imageToStore = image.dataUrl;
            } else {
                return;
            }

            await saveProfileImage(imageToStore);
            triggerHaptic('success');
        } catch (e) {
            console.error('Photo selection cancelled or failed', e);
        } finally {
            setIsProcessingImage(false);
        }
    };

    const handleSelectPreset = async (presetId: string) => {
        try {
            setIsProcessingImage(true);
            await cleanOldNativeAvatar();
            await saveProfileImage(presetId);
            triggerHaptic('success');
        } catch (e) {
            console.error('Failed to save preset avatar', e);
        } finally {
            setIsProcessingImage(false);
        }
    };

    const handleRemovePhoto = async () => {
        try {
            setIsProcessingImage(true);
            await cleanOldNativeAvatar();
            await saveProfileImage('');
            triggerHaptic('success');
        } catch (e) {
            console.error('Failed to remove avatar', e);
        } finally {
            setIsProcessingImage(false);
        }
    };

    const hasCustomAvatar = Boolean(profileImage && profileImage !== DEFAULT_AVATAR);

    return (
        <div className="bg-background-dark text-white h-screen flex flex-col font-sans select-none">
            <Header
                title="Profile"
                rightActions={
                    <button
                        onClick={() => {
                            triggerHaptic();
                            navigate('/settings');
                        }}
                        className="p-2 rounded-full hover:bg-white/10 active:scale-95 transition-all"
                        aria-label="Settings"
                    >
                        <Settings size={20} />
                    </button>
                }
            />

            <div className="flex-1 overflow-y-auto w-full pb-24">
                {/* Profile Header Hero */}
                <div className="flex flex-col items-center px-4 pt-6 pb-6">
                    {/* Avatar with tap-to-change and status badge */}
                    <div className="relative group">
                        <button
                            onClick={() => {
                                triggerHaptic();
                                setIsPickerSheetOpen(true);
                            }}
                            className="relative size-28 rounded-full ring-4 ring-primary/30 shadow-2xl bg-slate-800 overflow-hidden cursor-pointer active:scale-95 transition-all focus:outline-none focus:ring-primary/60 block"
                            aria-label="Change profile picture"
                        >
                            <img
                                src={profileImage}
                                alt="Profile avatar"
                                draggable={false}
                                onDragStart={(e) => e.preventDefault()}
                                className="size-full object-cover select-none pointer-events-none"
                                onError={(e) => {
                                    (e.target as HTMLImageElement).src = DEFAULT_AVATAR;
                                }}
                            />

                            {/* Processing Loading Overlay */}
                            {isProcessingImage && (
                                <div className="absolute inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center">
                                    <Loader2 className="animate-spin text-primary" size={28} />
                                </div>
                            )}

                            {/* Hover/Tap Overlay Guide */}
                            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <Camera className="text-white drop-shadow" size={24} />
                            </div>
                        </button>

                        {/* Camera Action Badge */}
                        <button
                            onClick={() => {
                                triggerHaptic();
                                setIsPickerSheetOpen(true);
                            }}
                            className="absolute bottom-0 right-0 size-9 bg-primary hover:bg-primary-hover text-white rounded-full flex items-center justify-center border-2 border-[#121118] shadow-lg active:scale-90 transition-all cursor-pointer"
                            aria-label="Edit photo"
                        >
                            <Camera size={16} />
                        </button>
                    </div>

                    {/* Reader Preset Quick Hint */}
                    <button
                        onClick={() => {
                            triggerHaptic();
                            setIsPresetModalOpen(true);
                        }}
                        className="mt-2 text-[11px] font-medium text-primary/90 hover:text-primary flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 hover:bg-primary/20 transition-colors cursor-pointer"
                    >
                        <Sparkles size={12} />
                        <span>Choose Reader Avatar</span>
                    </button>

                    {/* Name Editing Section */}
                    <div className="mt-3 flex flex-col items-center">
                        {isEditingName ? (
                            <div className="flex flex-col items-center gap-1.5 animate-in fade-in zoom-in-95 duration-150">
                                <div className="flex items-center gap-2">
                                    <input
                                        value={profileName}
                                        onChange={(e) => {
                                            setProfileName(e.target.value.slice(0, 30));
                                            if (nameError) setNameError(null);
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleSaveName();
                                            if (e.key === 'Escape') {
                                                setIsEditingName(false);
                                                setNameError(null);
                                            }
                                        }}
                                        className={`bg-slate-800/90 border rounded-xl px-3.5 py-1.5 text-base font-bold text-center text-white outline-none w-52 transition-colors ${
                                            nameError ? 'border-rose-500 ring-1 ring-rose-500' : 'border-slate-700 focus:border-primary'
                                        }`}
                                        autoFocus
                                        placeholder="Your Reader Name"
                                    />
                                    <button
                                        onClick={handleSaveName}
                                        className="size-9 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 flex items-center justify-center active:scale-95 transition-all"
                                        aria-label="Save name"
                                    >
                                        <Check size={18} />
                                    </button>
                                </div>
                                <div className="flex items-center justify-between w-52 px-1 text-[11px]">
                                    {nameError ? (
                                        <span className="text-rose-400 font-medium">{nameError}</span>
                                    ) : (
                                        <span className="text-slate-500">Tap Check to save</span>
                                    )}
                                    <span className="text-slate-500">{profileName.length}/30</span>
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2">
                                <h1 className="text-2xl font-bold tracking-tight text-white">{profileName}</h1>
                                <button
                                    onClick={() => {
                                        triggerHaptic();
                                        setIsEditingName(true);
                                    }}
                                    className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 active:scale-95 transition-all"
                                    aria-label="Edit name"
                                >
                                    <Edit2 size={16} />
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Reading Stats & Streak */}
                <ReadingStatsCard stats={stats} loading={loading} />

                {/* Settings & History Navigation */}
                <div className="px-4 flex flex-col gap-3 pb-8">
                    <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-widest px-1 mb-1">
                        Settings & History
                    </h3>
                    {[
                        { icon: History, label: 'Scraping History', sub: 'Manage your AI-scraped novels', to: '/history' },
                        { icon: Settings, label: 'App Settings', sub: 'Audio, appearance & storage', to: '/settings' },
                        { icon: Shield, label: 'Privacy & Security', sub: 'Secure your reading data', to: '/privacy' },
                    ].map(({ icon: Icon, label, sub, to }) => (
                        <button
                            key={to}
                            onClick={() => {
                                triggerHaptic();
                                navigate(to);
                            }}
                            className="group flex items-center justify-between w-full p-4 rounded-xl border border-white/5 bg-[#121118] hover:bg-white/5 active:scale-[0.99] transition-all cursor-pointer"
                        >
                            <div className="flex items-center gap-3">
                                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-slate-300 group-hover:bg-primary group-hover:text-white transition-colors">
                                    <Icon size={20} />
                                </div>
                                <div className="text-left">
                                    <p className="font-semibold text-sm text-white">{label}</p>
                                    <p className="text-slate-500 text-[11px]">{sub}</p>
                                </div>
                            </div>
                            <div className="text-slate-500 group-hover:translate-x-1 transition-transform">
                                {'>'}
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* Avatar Picker Bottom Sheet */}
            <AvatarPickerSheet
                isOpen={isPickerSheetOpen}
                onClose={() => setIsPickerSheetOpen(false)}
                onSelectCamera={() => handlePhotoSelection(CameraSource.Camera)}
                onSelectGallery={() => handlePhotoSelection(CameraSource.Photos)}
                onOpenPresets={() => setIsPresetModalOpen(true)}
                onRemovePhoto={handleRemovePhoto}
                hasCustomAvatar={hasCustomAvatar}
            />

            {/* Reader Presets Modal */}
            <PresetAvatarModal
                isOpen={isPresetModalOpen}
                onClose={() => setIsPresetModalOpen(false)}
                currentAvatar={profileImage}
                onSelectPreset={handleSelectPreset}
            />

            <FooterNavigation />
        </div>
    );
};
