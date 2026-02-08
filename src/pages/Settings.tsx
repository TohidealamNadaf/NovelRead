
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import type { AppSettings } from '../services/settings.service';
import { settingsService } from '../services/settings.service';
import { updateService } from '../services/update.service';
import type { UpdateState } from '../services/update.service';
import { ChevronRight, Palette, Globe, MoveVertical, BookOpen, Trash2, FolderOpen, Shield, Cloud, RefreshCw, Download, CheckCircle2 } from 'lucide-react';
import clsx from 'clsx';

export const Settings = () => {
    const [settings, setSettings] = useState<AppSettings>(settingsService.getSettings());
    const [cacheSize, setCacheSize] = useState("Calculating...");
    const [updateState, setUpdateState] = useState<UpdateState>({
        status: 'idle',
        currentVersion: '1.1.0',
        latestVersion: '1.1.0',
        progress: 0
    });

    useEffect(() => {
        const settingsUnsub = settingsService.subscribe((newSettings) => {
            setSettings(newSettings);
        });

        const updateUnsub = updateService.subscribe((state) => {
            setUpdateState(state);
        });

        // Mock cache size calculation
        setTimeout(() => setCacheSize("1.2 GB"), 1000);

        return () => {
            settingsUnsub();
            updateUnsub();
        };
    }, []);

    const toggleSetting = (key: keyof AppSettings) => {
        if (typeof settings[key] === 'boolean') {
            settingsService.updateSettings({ [key]: !settings[key] });
        }
    };

    const cycleTheme = () => {
        const themes: AppSettings['theme'][] = ['light', 'dark', 'sepia', 'oled'];
        const currentIdx = themes.indexOf(settings.theme);
        const nextTheme = themes[(currentIdx + 1) % themes.length];
        settingsService.updateSettings({ theme: nextTheme });
    };

    const handleClearCache = async () => {
        if (confirm("Are you sure you want to clear the cache? related data will be re-downloaded.")) {
            setCacheSize("Clearing...");
            setTimeout(() => setCacheSize("0 MB"), 1500);
        }
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

    // Helper to render toggle switch
    const Toggle = ({ active }: { active: boolean }) => (
        <div className={clsx("ios-toggle", active ? "ios-toggle-on" : "")}>
            <span className={clsx("ios-toggle-circle", active ? "ios-toggle-circle-on" : "ios-toggle-circle-off")}></span>
        </div>
    );

    return (
        <div className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-white h-screen flex flex-col overflow-hidden">
            {/* Sticky Header */}
            <div className="sticky top-0 z-30 bg-background-light/90 dark:bg-background-dark/90 backdrop-blur-xl border-b border-slate-200 dark:border-white/5 pt-[18px] shrink-0">
                <div className="flex items-center justify-between h-14 px-4">
                    <Link to="/profile" className="flex items-center justify-center p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors">
                        <div className="flex size-9 shrink-0 items-center overflow-hidden rounded-full ring-2 ring-primary/20">
                            <div className="bg-center bg-no-repeat aspect-square bg-cover size-full" style={{ backgroundImage: 'url("https://lh3.googleusercontent.com/aida-public/AB6AXuDjCOham51YfTM7PcgkgKspU9PvDHuom_3rGeCzHDOnhZnOzp09BhpYTuEnobo9LY8vOsfLsujPy9_QEMQ7WaQQSrFMdLgnji7T5irQ-C7DSmSq-0RKsDtEHLdFk2Jd7O9Qpw1VCPG_71gSZCD9ROyRef4a9hy1bzxv5Kmeyh5eiAx9wKqIXAtSkLrqYxyMQFSb2RIi6syEVabDEHarMZ8ece6wHlOJW3ky5o3LtKvE3JC2EZaJpRlwT5R61uO6G-mUqtqV5qNjIYyE")' }}></div>
                        </div>
                    </Link>
                    <h1 className="text-lg font-bold">Settings</h1>
                    <div className="w-16"></div>
                </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto">
                <div className="pb-40">
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
                        <div className="ios-list-item cursor-pointer" onClick={handleClearCache}>
                            <div className="flex size-8 items-center justify-center rounded-lg bg-green-500 text-white">
                                <Trash2 size={18} />
                            </div>
                            <div className="flex-1 text-[15px] font-medium">Cache management</div>
                            <div className="flex items-center gap-1 text-slate-500 text-[14px]">
                                {cacheSize}
                                <ChevronRight size={18} />
                            </div>
                        </div>
                        <div className="ios-list-item cursor-pointer">
                            <div className="flex size-8 items-center justify-center rounded-lg bg-green-500 text-white">
                                <FolderOpen size={18} />
                            </div>
                            <div className="flex-1 text-[15px] font-medium">Download location</div>
                            <div className="flex items-center gap-1 text-slate-500 text-[14px]">
                                {settings.downloadLocation === 'internal' ? 'Internal Storage' : 'SD Card'}
                                <ChevronRight size={18} />
                            </div>
                        </div>
                    </div>

                    <h2 className="ios-section-title">Advanced</h2>
                    <div className="bg-white dark:bg-[#1c1c1e] border-y border-slate-200 dark:border-white/5">
                        <div className="ios-list-item cursor-pointer">
                            <div className="flex size-8 items-center justify-center rounded-lg bg-orange-500 text-white">
                                <Shield size={18} />
                            </div>
                            <div className="flex-1 text-[15px] font-medium">Scraper proxies</div>
                            <div className="flex items-center gap-1 text-slate-500 text-[14px]">
                                {settings.scraperProxy ? 'Configured' : 'None'}
                                <ChevronRight size={18} />
                            </div>
                        </div>
                        <div className="ios-list-item cursor-pointer" onClick={() => toggleSetting('cloudSync')}>
                            <div className="flex size-8 items-center justify-center rounded-lg bg-cyan-500 text-white">
                                <Cloud size={18} />
                            </div>
                            <div className="flex-1 text-[15px] font-medium">Cloud sync</div>
                            <Toggle active={settings.cloudSync} />
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
                            Current Version: {updateState.currentVersion} (Build 82)
                        </p>
                    </div>
                </div>
            </div>

            <Navbar />
        </div>
    );
};
