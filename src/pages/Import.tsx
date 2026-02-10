import { useState, useEffect } from 'react';
import { MoreHorizontal, Clipboard, Book, Bookmark, XCircle, Loader2, Minimize2 } from 'lucide-react';
import { scraperService, type NovelMetadata, type ScraperProgress } from '../services/scraper.service';
import { manhwaScraperService } from '../services/manhwaScraper.service';
import { useNavigate } from 'react-router-dom';
import { Header } from '../components/Header';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';
import clsx from 'clsx';

export const Import = () => {
    const navigate = useNavigate();
    const [url, setUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [novel, setNovel] = useState<NovelMetadata | null>(scraperService.activeNovelMetadata);
    const [scraping, setScraping] = useState(scraperService.isScraping);
    const [progress, setProgress] = useState<ScraperProgress>(scraperService.progress);
    const [activeTab, setActiveTab] = useState<'novel' | 'manhwa'>('novel');

    useEffect(() => {
        // Request Permissions
        if (Capacitor.getPlatform() !== 'web') {
            LocalNotifications.requestPermissions();
        }

        // Subscribe to scraper progress
        const unsubScraper = scraperService.subscribe((newProgress, isScraping) => {
            if (!manhwaScraperService.isScraping) {
                setProgress(newProgress);
                setScraping(isScraping);
                if (isScraping && scraperService.activeNovelMetadata) {
                    setNovel(scraperService.activeNovelMetadata);
                    setActiveTab('novel');
                }
            }
        });

        const unsubManhwa = manhwaScraperService.subscribe((newProgress, isScraping) => {
            if (isScraping) {
                setProgress(newProgress);
                setScraping(isScraping);
                if (manhwaScraperService.activeNovelMetadata) {
                    setNovel(manhwaScraperService.activeNovelMetadata);
                    setActiveTab('manhwa');
                }
            }
        });

        // Clear metadata on mount if not currently scraping
        if (!scraperService.isScraping && !manhwaScraperService.isScraping) {
            scraperService.clearMetadata();
            setNovel(null);
        }

        return () => {
            unsubScraper();
            unsubManhwa();
        };
    }, []);

    const handlePreview = async () => {
        if (!url) return;
        setLoading(true);
        setNovel(null); // Clear previous
        try {
            const service = activeTab === 'manhwa' ? manhwaScraperService : scraperService;
            const data = await service.fetchNovel(url);
            setNovel(data);
        } catch (error) {
            console.error(error);
            alert('Failed to fetch novel metadata. Check URL or try another source.');
        } finally {
            setLoading(false);
        }
    };

    const handleScrape = async () => {
        if (!url) return;

        let targetNovel = novel;
        const service = activeTab === 'manhwa' ? manhwaScraperService : scraperService;

        // Auto-fetch metadata if not already loaded
        if (!targetNovel) {
            setLoading(true);
            try {
                targetNovel = await service.fetchNovel(url);
                setNovel(targetNovel);
            } catch (error) {
                console.error(error);
                alert('Failed to load novel details. Please check the URL.');
                setLoading(false);
                return;
            }
            setLoading(false);
        }

        if (!targetNovel) return;

        if (activeTab === 'manhwa') {
            manhwaScraperService.startImport(url, targetNovel);
        } else {
            scraperService.startImport(url, targetNovel, 'Imported');
        }
    };

    return (
        <div className="relative w-full h-screen bg-background-light dark:bg-background-dark flex flex-col overflow-hidden">
            {/* Top App Bar */}
            {/* Top App Bar */}
            <Header
                title="Import Novel"
                showBack
                rightActions={
                    <button className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                        <MoreHorizontal className="text-2xl" />
                    </button>
                }
            />

            {/* Main Content */}
            <div className="flex-1 overflow-y-auto px-4 pb-48">
                {/* Tabs */}
                <div className="mt-4 flex p-1 bg-slate-100 dark:bg-[#1d1c27] rounded-xl border border-slate-200 dark:border-[#3f3b54]">
                    <button
                        onClick={() => {
                            setActiveTab('novel');
                            setUrl('');
                            setNovel(null);
                        }}
                        className={clsx(
                            "flex-1 h-9 rounded-lg text-sm font-bold transition-all",
                            activeTab === 'novel'
                                ? "bg-white dark:bg-[#3f3b54] text-primary shadow-sm"
                                : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-300"
                        )}
                    >
                        Novel
                    </button>
                    <button
                        onClick={() => {
                            setActiveTab('manhwa');
                            setUrl('');
                            setNovel(null);
                        }}
                        className={clsx(
                            "flex-1 h-9 rounded-lg text-sm font-bold transition-all",
                            activeTab === 'manhwa'
                                ? "bg-white dark:bg-[#3f3b54] text-primary shadow-sm"
                                : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-300"
                        )}
                    >
                        Manhwa
                    </button>
                </div>

                {/* URL Input Section */}
                <div className="mt-4 space-y-4">
                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-medium opacity-70 px-1">Source URL</label>
                        <div className="flex items-stretch bg-white dark:bg-[#1d1c27] rounded-xl border border-slate-200 dark:border-[#3f3b54] overflow-hidden focus-within:ring-2 ring-primary/50 transition-all">
                            <input
                                className="flex-1 bg-transparent border-none text-base p-4 focus:ring-0 placeholder:text-slate-400 dark:placeholder:text-[#a19db9] outline-none"
                                placeholder={activeTab === 'novel' ? "https://novelfire.com/..." : "https://manhwa-site.com/..."}
                                type="text"
                                value={url}
                                onChange={(e) => {
                                    setUrl(e.target.value);
                                    // Reset detected metadata when URL changes
                                    if (novel) setNovel(null);
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        handlePreview();
                                    }
                                }}
                            />
                            <button onClick={handlePreview} disabled={loading || scraping} className="px-4 flex items-center justify-center text-primary border-l border-slate-100 dark:border-[#3f3b54] disabled:opacity-50">
                                {loading ? <Loader2 className="animate-spin" /> : <Clipboard />}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Preview Card */}
                {novel && (
                    <div className="mt-8 animate-in fade-in slide-in-from-bottom-4">
                        <p className="text-xs font-bold uppercase tracking-widest opacity-50 mb-3 px-1">Detected Metadata</p>
                        <div className="bg-white dark:bg-[#1d1c27] rounded-xl p-4 flex gap-4 shadow-sm border border-slate-100 dark:border-[#3f3b54]">
                            <div className="w-24 h-36 rounded-lg bg-cover bg-center shadow-md flex-shrink-0" style={{ backgroundImage: `url('${novel.coverUrl}')` }}>
                            </div>
                            <div className="flex flex-col justify-between py-1">
                                <div>
                                    <h3 className="text-lg font-bold leading-tight">{novel.title}</h3>
                                    <p className="text-sm opacity-60 mt-1">{novel.author}</p>
                                </div>
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 text-xs font-medium opacity-70">
                                        <Book size={14} />
                                        {novel.chapters.length} Chapters Found
                                    </div>
                                    <a href={url} target="_blank" rel="noreferrer" className="flex items-center justify-center w-full h-8 bg-slate-100 dark:bg-[#3f3b54] text-xs font-bold rounded-lg transition-active active:scale-95">
                                        VIEW SOURCE SITE
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Scraping Progress */}
                {scraping && (
                    <div className="mt-8 space-y-4 animate-in fade-in slide-in-from-bottom-4">
                        <div className="flex items-end justify-between px-1">
                            <h3 className="text-base font-bold">Scraping Chapters</h3>
                            <p className="text-sm font-medium text-primary">{progress.current} / {progress.total}</p>
                        </div>
                        {/* Progress Bar Container */}
                        <div className="space-y-3">
                            <div className="h-3 w-full bg-slate-200 dark:bg-[#1d1c27] rounded-full overflow-hidden">
                                <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${(progress.current / progress.total) * 100}%` }}></div>
                            </div>
                            {/* Progress Log */}
                            <div className="bg-black/5 dark:bg-black/20 rounded-lg p-3 font-mono text-[11px] leading-relaxed opacity-80 h-40 overflow-y-auto">
                                {progress.logs.map((log, index) => (
                                    <div key={index} className={clsx("flex justify-between items-center", index === 0 ? "text-primary animate-pulse" : "text-emerald-500")}>
                                        <span>{log}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Background Hint */}
                        <div className="flex items-center gap-3 bg-primary/10 border border-primary/20 p-4 rounded-xl">
                            <Minimize2 className="text-primary shrink-0" size={20} />
                            <p className="text-xs text-primary font-medium leading-relaxed">
                                You can safely leave this page or minimize the app.
                                <span className="block opacity-70 mt-0.5">Scraping will continue in the background.</span>
                            </p>
                        </div>
                    </div>
                )}
            </div>

            {/* Footer Actions */}
            <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-background-light dark:from-background-dark via-background-light/95 dark:via-background-dark/95 to-transparent z-10">
                <div className="flex flex-col gap-3">
                    <button
                        onClick={handleScrape}
                        disabled={!url || loading || scraping}
                        className="w-full h-14 bg-primary text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-primary/20 transition-transform active:scale-95 disabled:opacity-50 disabled:active:scale-100"
                    >
                        {loading ? <Loader2 className="animate-spin" /> : (scraping ? <Loader2 className="animate-spin" /> : <Book />)}
                        {loading ? 'LOADING DETAILS...' : (scraping ? 'SCRAPING...' : 'START IMPORT')}
                    </button>
                    <div className="grid grid-cols-2 gap-3">
                        <button className="h-12 border-2 border-slate-200 dark:border-[#3f3b54] rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-colors hover:bg-slate-50 dark:hover:bg-white/5 opacity-50 cursor-not-allowed">
                            <Bookmark className="text-lg" />
                            Save Library
                        </button>
                        <button onClick={() => navigate(-1)} className="h-12 border-2 border-slate-200 dark:border-[#3f3b54] rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-colors hover:bg-slate-50 dark:hover:bg-white/5 text-rose-500 border-rose-500/20">
                            <XCircle className="text-lg" />
                            Cancel
                        </button>
                    </div>
                </div>
                {/* iOS Home Indicator Spacing */}
                <div className="h-4"></div>
            </div>

        </div>
    );
};
