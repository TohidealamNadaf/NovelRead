
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import type { AppSettings } from '../services/settings.service';
import { settingsService } from '../services/settings.service';
import { ChevronRight, Palette, Globe, MoveVertical, BookOpen, Trash2, FolderOpen, Shield, Cloud, RefreshCw } from 'lucide-react';
import clsx from 'clsx';

export const Settings = () => {
    // const navigate = useNavigate(); // Unused now
    const [settings, setSettings] = useState<AppSettings>(settingsService.getSettings());
    const [cacheSize, setCacheSize] = useState("Calculating...");

    useEffect(() => {
        const unsubscribe = settingsService.subscribe((newSettings) => {
            setSettings(newSettings);
        });

        // Mock cache size calculation
        setTimeout(() => setCacheSize("1.2 GB"), 1000);

        return () => unsubscribe();
    }, []);

    const toggleSetting = (key: keyof AppSettings) => {
        // Only works for boolean settings
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

    // Helper to render toggle switch
    const Toggle = ({ active }: { active: boolean }) => (
        <div className={clsx("ios-toggle", active ? "ios-toggle-on" : "")}>
            <span className={clsx("ios-toggle-circle", active ? "ios-toggle-circle-on" : "ios-toggle-circle-off")}></span>
        </div>
    );

    return (
        <div className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-white min-h-screen">
            <div className="relative flex h-full min-h-screen w-full flex-col overflow-x-hidden">
                <div className="sticky top-0 z-30 bg-background-light/90 dark:bg-background-dark/90 backdrop-blur-xl border-b border-slate-200 dark:border-white/5 pt-safe">
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

                <div className="flex-1 pb-40">
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
                        <button className="w-full flex items-center justify-center gap-2 h-12 bg-white dark:bg-[#1c1c1e] border border-slate-200 dark:border-white/5 rounded-xl active:scale-[0.98] transition-all shadow-sm group">
                            <RefreshCw className="text-primary group-active:rotate-180 transition-transform duration-500" size={20} />
                            <span className="text-[15px] font-semibold">Check for Updates</span>
                        </button>
                        <p className="text-center mt-4 text-[12px] text-slate-500 dark:text-slate-500">
                            Version 2.4.0 (Build 82)
                        </p>
                    </div>
                </div>

                <Navbar />
            </div>
        </div>
    );
};
