
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FooterNavigation } from '../components/FooterNavigation';
import { Header } from '../components/Header';
import type { AppSettings } from '../services/settings.service';
import { settingsService } from '../services/settings.service';
import { updateService } from '../services/update.service';
import type { UpdateState } from '../services/update.service';
import { cacheService } from '../services/cache.service';
import { ChevronRight, Palette, Globe, MoveVertical, BookOpen, Trash2, FolderOpen, Shield, Cloud, RefreshCw, Download, CheckCircle2, AlertTriangle, RotateCcw } from 'lucide-react';
import clsx from 'clsx';
import { Preferences } from '@capacitor/preferences';

// Helper to render toggle switch
const Toggle = ({ active }: { active: boolean }) => (
    <div className={clsx("ios-toggle", active ? "ios-toggle-on" : "")}>
        <span className={clsx("ios-toggle-circle", active ? "ios-toggle-circle-on" : "ios-toggle-circle-off")}></span>
    </div>
);

export const Settings = () => {
    const [settings, setSettings] = useState<AppSettings>(settingsService.getSettings());
    const [cacheSize, setCacheSize] = useState("Calculating...");
    const [profileImage, setProfileImage] = useState<string>("https://img.freepik.com/free-psd/3d-illustration-person-with-sunglasses_23-2149436188.jpg");
    const [updateState, setUpdateState] = useState<UpdateState>({
        status: 'idle',
        currentVersion: '1.2.0', // Updated build version
        latestVersion: '1.2.0',
        progress: 0
    });

    // Dialog States
    const [showClearCacheConfirm, setShowClearCacheConfirm] = useState(false);
    const [showResetConfirm, setShowResetConfirm] = useState(false);

    useEffect(() => {
        const settingsUnsub = settingsService.subscribe((newSettings) => {
            setSettings(newSettings);
        });

        const updateUnsub = updateService.subscribe((state) => {
            setUpdateState(state);
        });

        loadProfileImage();
        calculateCache();

        return () => {
            settingsUnsub();
            updateUnsub();
        };
    }, []);

    const loadProfileImage = async () => {
        const { value } = await Preferences.get({ key: 'profileImage' });
        if (value) {
            setProfileImage(value);
        }
    };

    const calculateCache = async () => {
        setCacheSize("Calculating...");
        const size = await cacheService.getCacheSize();
        setCacheSize(size);
    };

    const toggleSetting = (key: keyof AppSettings) => {
        if (typeof settings[key] === 'boolean') {
            settingsService.updateSettings({ [key]: !settings[key] });
        }
    };

    const cycleTheme = () => {
        // Cycle: light -> dark -> sepia -> light
        // For production simplicity, maybe just light/dark for now or keep sepia if implemented
        const themes: AppSettings['theme'][] = ['light', 'dark', 'sepia'];
        const currentIndex = themes.indexOf(settings.theme);
        const nextTheme = themes[(currentIndex + 1) % themes.length];
        settingsService.updateSettings({ theme: nextTheme });
    };

    const handleClearCache = async () => {
        setCacheSize("Clearing...");
        const success = await cacheService.clearCache();
        if (success) {
            await calculateCache();
            setShowClearCacheConfirm(false);
        } else {
            setCacheSize("Error");
        }
    };

    const handleResetSettings = async () => {
        await settingsService.updateSettings({
            theme: 'dark',
            fontSize: 1.125,
            autoScroll: true,
            pageFlipAnimation: false,
            // Reset other defaults if needed
        });
        setShowResetConfirm(false);
        window.location.reload(); // Force reload to ensure everything applies cleanly
    };

    const handleUpdateAction = () => {
        if (updateState.status === 'idle') {
            updateService.checkForUpdates();
        } else if (updateState.status === 'update-found') {
            updateService.downloadUpdate();
        } else if (updateState.status === 'ready') {
            updateService.installUpdate();
        }
    };

    return (
        <div className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-white h-screen flex flex-col overflow-hidden font-display">
            {/* Sticky Header */}
            <Header
                title="Settings"
                leftContent={
                    <Link to="/profile" className="flex items-center justify-center p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors">
                        <div className="flex size-9 shrink-0 items-center overflow-hidden rounded-full ring-2 ring-primary/20">
                            <div className="bg-center bg-no-repeat aspect-square bg-cover size-full" style={{ backgroundImage: `url("${profileImage}")` }}></div>
                        </div>
                    </Link>
                }
                className="border-b border-slate-200 dark:border-white/5"
            />

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto w-full">
                <div className="pb-40 pt-2">
                    <h2 className="ios-section-title">General</h2>
                    <div className="bg-white dark:bg-[#1c1c1e] border-y border-slate-200 dark:border-white/5">
                        <div className="ios-list-item cursor-pointer" onClick={cycleTheme}>
                            <div className="flex size-8 items-center justify-center rounded-lg bg-blue-500 text-white">
                                <Palette size={18} />
                            </div>
                            <div className="flex-1 text-[15px] font-medium">Theme</div>
                            <div className="flex items-center gap-1 text-slate-500 text-[14px]">
                                <span className="capitalize">{settings.theme}</span>
                                <ChevronRight size={18} />
                            </div>
                        </div>
                        <div className="ios-list-item cursor-pointer">
                            <div className="flex size-8 items-center justify-center rounded-lg bg-indigo-500 text-white">
                                <Globe size={18} />
                            </div>
                            <div className="flex-1 text-[15px] font-medium">Language</div>
                            <div className="flex items-center gap-1 text-slate-500 text-[14px]">
                                English
                                <ChevronRight size={18} />
                            </div>
                        </div>
                    </div>

                    <h2 className="ios-section-title">Reading</h2>
                    <div className="bg-white dark:bg-[#1c1c1e] border-y border-slate-200 dark:border-white/5">
                        <div className="ios-list-item cursor-pointer" onClick={() => toggleSetting('autoScroll')}>
                            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-white">
                                <MoveVertical size={18} />
                            </div>
                            <div className="flex-1 text-[15px] font-medium">Auto-scroll</div>
                            <Toggle active={settings.autoScroll} />
                        </div>
                        <div className="ios-list-item cursor-pointer" onClick={() => toggleSetting('pageFlipAnimation')}>
                            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-white">
                                <BookOpen size={18} />
                            </div>
                            <div className="flex-1 text-[15px] font-medium">Page flip animation</div>
                            <Toggle active={settings.pageFlipAnimation} />
                        </div>
                    </div>

                    <h2 className="ios-section-title">Storage</h2>
                    <div className="bg-white dark:bg-[#1c1c1e] border-y border-slate-200 dark:border-white/5">
                        <div className="ios-list-item cursor-pointer" onClick={() => setShowClearCacheConfirm(true)}>
                            <div className="flex size-8 items-center justify-center rounded-lg bg-green-500 text-white">
                                <Trash2 size={18} />
                            </div>
                            <div className="flex-1 text-[15px] font-medium">Clear Cache</div>
                            <div className="flex items-center gap-1 text-slate-500 text-[14px]">
                                {cacheSize}
                                <ChevronRight size={18} />
                            </div>
                        </div>
                        <div className="ios-list-item cursor-pointer opacity-50">
                            <div className="flex size-8 items-center justify-center rounded-lg bg-green-500 text-white">
                                <FolderOpen size={18} />
                            </div>
                            <div className="flex-1 text-[15px] font-medium">Download location</div>
                            <div className="flex items-center gap-1 text-slate-500 text-[14px]">
                                Internal
                                <span className="text-[10px] ml-1 border border-slate-300 dark:border-slate-600 px-1 rounded">PRO</span>
                            </div>
                        </div>
                    </div>

                    <h2 className="ios-section-title">Advanced</h2>
                    <div className="bg-white dark:bg-[#1c1c1e] border-y border-slate-200 dark:border-white/5">
                        <div className="ios-list-item cursor-pointer opacity-50">
                            <div className="flex size-8 items-center justify-center rounded-lg bg-orange-500 text-white">
                                <Shield size={18} />
                            </div>
                            <div className="flex-1 text-[15px] font-medium">Scraper proxies</div>
                            <div className="flex items-center gap-1 text-slate-500 text-[14px]">
                                None
                            </div>
                        </div>
                        <div className="ios-list-item cursor-pointer opacity-50">
                            <div className="flex size-8 items-center justify-center rounded-lg bg-cyan-500 text-white">
                                <Cloud size={18} />
                            </div>
                            <div className="flex-1 text-[15px] font-medium">Cloud sync</div>
                            <div className="flex items-center gap-1 text-slate-500 text-[14px]">
                                Disabled
                            </div>
                        </div>
                        <div className="ios-list-item cursor-pointer text-red-500" onClick={() => setShowResetConfirm(true)}>
                            <div className="flex size-8 items-center justify-center rounded-lg bg-red-500/10 text-red-500">
                                <RotateCcw size={18} />
                            </div>
                            <div className="flex-1 text-[15px] font-medium">Reset All Settings</div>
                        </div>
                    </div>

                    <div className="mt-10 px-6">
                        <div className="bg-white dark:bg-[#1c1c1e] border border-slate-200 dark:border-white/5 rounded-2xl overflow-hidden shadow-sm">
                            <button
                                onClick={handleUpdateAction}
                                disabled={updateState.status === 'checking' || updateState.status === 'downloading'}
                                className="w-full flex items-center justify-between p-4 active:bg-slate-100 dark:active:bg-slate-800 transition-colors group disabled:opacity-50"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                        {updateState.status === 'idle' || updateState.status === 'checking' ? (
                                            <RefreshCw className={clsx("text-primary", updateState.status === 'checking' && "animate-spin")} size={22} />
                                        ) : updateState.status === 'update-found' || updateState.status === 'downloading' ? (
                                            <Download className="text-primary animate-bounce" size={22} />
                                        ) : (
                                            <CheckCircle2 className="text-green-500" size={22} />
                                        )}
                                    </div>
                                    <div className="text-left">
                                        <p className="text-[15px] font-bold">
                                            {updateState.status === 'idle' ? 'Check for Updates' :
                                                updateState.status === 'checking' ? 'Checking for updates...' :
                                                    updateState.status === 'update-found' ? 'Update Found!' :
                                                        updateState.status === 'downloading' ? `Downloading update... ${updateState.progress}%` :
                                                            'Update Ready'}
                                        </p>
                                        <p className="text-[11px] text-slate-500">
                                            {updateState.status === 'idle' ? 'Check if a newer version is available' :
                                                updateState.status === 'update-found' ? `Version ${updateState.latestVersion} is available` :
                                                    updateState.status === 'ready' ? 'Version downloaded and ready to install' :
                                                        'Building latest assets...'}
                                        </p>
                                    </div>
                                </div>
                                {updateState.status === 'idle' && <ChevronRight className="text-slate-400" size={20} />}
                            </button>

                            {updateState.status === 'update-found' && (
                                <div className="px-4 pb-4 animate-in fade-in slide-in-from-top duration-300">
                                    <div className="mt-2 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-white/5">
                                        <p className="text-[10px] font-bold text-primary uppercase tracking-wider mb-1">What's New</p>
                                        <pre className="text-[12px] text-slate-600 dark:text-slate-400 font-sans whitespace-pre-line leading-relaxed">
                                            {updateState.releaseNotes}
                                        </pre>
                                    </div>
                                    <button
                                        onClick={() => updateService.downloadUpdate()}
                                        className="w-full mt-4 h-12 bg-primary text-white rounded-xl font-bold shadow-lg shadow-primary/20 active:scale-[0.98] transition-all"
                                    >
                                        Download & Build APK
                                    </button>
                                </div>
                            )}

                            {updateState.status === 'downloading' && (
                                <div className="px-4 pb-4">
                                    <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mt-2">
                                        <div
                                            className="h-full bg-primary transition-all duration-300 ease-out"
                                            style={{ width: `${updateState.progress}%` }}
                                        />
                                    </div>
                                </div>
                            )}

                            {updateState.status === 'ready' && (
                                <div className="px-4 pb-4 animate-in zoom-in duration-300">
                                    <button
                                        onClick={() => updateService.installUpdate()}
                                        className="w-full mt-2 h-12 bg-green-500 text-white rounded-xl font-bold shadow-lg shadow-green-500/20 active:scale-[0.98] transition-all"
                                    >
                                        Install Now
                                    </button>
                                </div>
                            )}
                        </div>
                        <p className="text-center mt-6 text-[12px] text-slate-500 dark:text-slate-500 font-medium">
                            Current Version: {updateState.currentVersion} (Build 83)
                        </p>
                    </div>
                </div>
            </div>

            {/* Clear Cache Confirmation */}
            {showClearCacheConfirm && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in p-4">
                    <div className="bg-white dark:bg-[#1e1e24] w-full max-w-sm rounded-2xl p-6 shadow-2xl border border-white/10 scale-100 animate-in zoom-in-95 duration-200">
                        <div className="flex flex-col items-center text-center">
                            <div className="size-12 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center mb-4">
                                <AlertTriangle size={24} />
                            </div>
                            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Clear Cache?</h3>
                            <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">
                                This will remove cached images and temporary files. Reading logs and library updates will be safe.
                            </p>
                            <div className="grid grid-cols-2 gap-3 w-full">
                                <button
                                    onClick={() => setShowClearCacheConfirm(false)}
                                    className="px-4 py-2.5 rounded-xl font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleClearCache}
                                    className="px-4 py-2.5 rounded-xl font-semibold bg-amber-500 text-white hover:bg-amber-600 transition-colors shadow-lg shadow-amber-500/20"
                                >
                                    Yes, Clear
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Reset Settings Confirmation */}
            {showResetConfirm && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in p-4">
                    <div className="bg-white dark:bg-[#1e1e24] w-full max-w-sm rounded-2xl p-6 shadow-2xl border border-white/10 scale-100 animate-in zoom-in-95 duration-200">
                        <div className="flex flex-col items-center text-center">
                            <div className="size-12 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center mb-4">
                                <RotateCcw size={24} />
                            </div>
                            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Reset Settings?</h3>
                            <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">
                                This will revert all your preferences (theme, font size, etc.) to default. Your library and reading progress will NOT be deleted.
                            </p>
                            <div className="grid grid-cols-2 gap-3 w-full">
                                <button
                                    onClick={() => setShowResetConfirm(false)}
                                    className="px-4 py-2.5 rounded-xl font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleResetSettings}
                                    className="px-4 py-2.5 rounded-xl font-semibold bg-red-500 text-white hover:bg-red-600 transition-colors shadow-lg shadow-red-500/20"
                                >
                                    Reset
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <FooterNavigation />
        </div>
    );
};
