import { useState, useEffect } from 'react';
import { MoreHorizontal, Clipboard, Book, Bookmark, XCircle, Loader2, Minimize2, ChevronDown, Users, Search } from 'lucide-react';
import { scraperService, type NovelMetadata, type ScraperProgress } from '../services/scraper.service';
import { manhwaScraperService } from '../services/manhwaScraper.service';
import { useNavigate, useLocation } from 'react-router-dom';
import { Header } from '../components/Header';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';
import clsx from 'clsx';

export const Import = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [url, setUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [novel, setNovel] = useState<NovelMetadata | null>(scraperService.activeNovelMetadata);
    const [scraping, setScraping] = useState(scraperService.isScraping);
    const [progress, setProgress] = useState<ScraperProgress>(scraperService.progress);
    const [activeTab, setActiveTab] = useState<'novel' | 'manhwa' | 'search'>('novel');
    const [selectedPublisher, setSelectedPublisher] = useState<string>('');
    const [publisherLoading, setPublisherLoading] = useState(false);
    const [showPublisherDropdown, setShowPublisherDropdown] = useState(false);

    // Search State
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<NovelMetadata[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [selectedSource, setSelectedSource] = useState<'mangadex' | 'asura'>('mangadex');
    const [isImportComplete, setIsImportComplete] = useState(false);

    useEffect(() => {
        // Request Permissions
        if (Capacitor.getPlatform() !== 'web') {
            LocalNotifications.requestPermissions();
        }

        // Subscribe to scraper progress
        let wasScrapingNovel = false;
        const unsubScraper = scraperService.subscribe((newProgress, isScraping) => {
            if (!manhwaScraperService.isScraping) {
                // Check if just finished
                if (wasScrapingNovel && !isScraping) {
                    setIsImportComplete(true);
                }
                wasScrapingNovel = isScraping;

                setProgress(newProgress);
                setScraping(isScraping);
                if (isScraping && scraperService.activeNovelMetadata) {
                    setNovel(scraperService.activeNovelMetadata);
                    setActiveTab('novel');
                }
            }
        });

        let wasScrapingManhwa = false;
        const unsubManhwa = manhwaScraperService.subscribe((newProgress, isScraping) => {
            // Check if just finished
            if (wasScrapingManhwa && !isScraping) {
                setIsImportComplete(true);
            }
            wasScrapingManhwa = isScraping;

            setScraping(isScraping);
            if (isScraping) {
                setProgress(newProgress);
                if (manhwaScraperService.activeNovelMetadata) {
                    setNovel(manhwaScraperService.activeNovelMetadata);
                    setActiveTab('manhwa');
                }
            } else {
                // If it was scraping and now it's not, ensure progress is at 100% display-wise
                // although setIsImportComplete handles the success UI
                setProgress(newProgress);
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

    // Handle initial URL or Search Query from navigation state
    useEffect(() => {
        const state = location.state as { initialUrl?: string; initialQuery?: string };
        if (state) {
            if (state.initialUrl) {
                setUrl(state.initialUrl);
                setActiveTab('manhwa');
                // Use a short delay or ensure handlePreview handles the updated url state
                // handlePreview accepts an optional overrideUrl which is perfect here
                handlePreview(state.initialUrl, true);
            } else if (state.initialQuery) {
                setSearchQuery(state.initialQuery);
                setActiveTab('search');
                // Trigger search after a tick to ensure state is updated
                setTimeout(() => {
                    handleSearch();
                }, 100);
            }
        }
    }, [location.state]);

    const resetImportState = () => {
        setUrl('');
        setNovel(null);
        setSearchQuery('');
        setSearchResults([]);
        setSelectedPublisher('');
        setIsImportComplete(false);
        scraperService.clearMetadata();
        // Reset services to prevent progress bars from showing old data
        if (!scraperService.isScraping && !manhwaScraperService.isScraping) {
            scraperService.resetProgress?.();
            manhwaScraperService.resetProgress?.();
        }
    };

    const handleSearch = async () => {
        if (!searchQuery.trim()) return;
        setIsSearching(true);
        setSearchResults([]);
        try {
            const results = await manhwaScraperService.searchManga(searchQuery, selectedSource);
            setSearchResults(results);
        } catch (error) {
            console.error(error);
            alert('Search failed. Please try again.');
        } finally {
            setIsSearching(false);
        }
    };

    const handlePreview = async (overrideUrl?: string, forceManhwa?: boolean) => {
        const targetUrl = overrideUrl || url;
        if (!targetUrl) return;
        setLoading(true);
        setNovel(null);
        setSelectedPublisher('');
        try {
            // Determine service:
            // 1. If forced Manhwa (from Discover nav), use Manhwa service
            // 2. If URL matches known Manhwa domains, use Manhwa service
            // 3. Otherwise fallback to activeTab or default Scraper
            const isManhwaUrl = targetUrl.includes('asuracomic') || targetUrl.includes('mangadex.org') || targetUrl.includes('comick.io');
            const useManhwaService = forceManhwa || isManhwaUrl || activeTab === 'manhwa' || activeTab === 'search';

            const service = useManhwaService ? manhwaScraperService : scraperService;
            const data = await service.fetchNovel(targetUrl);
            setNovel(data);
            // If comick.art with publishers, auto-show publisher selection
            if (data.publishers && data.publishers.length > 0) {
                setShowPublisherDropdown(true);
            }
        } catch (error: any) {
            console.error(error);
            const msg = error.message || 'Failed to fetch novel metadata. Check URL or try another source.';
            alert(msg);
        } finally {
            setLoading(false);
        }
    };

    const handlePublisherSelect = async (publisher: string) => {
        setSelectedPublisher(publisher);
        setShowPublisherDropdown(false);
        if (!novel || !url) return;

        setPublisherLoading(true);
        try {
            const filteredChapters = await manhwaScraperService.fetchComickChaptersByPublisher(url, publisher);
            setNovel({
                ...novel,
                chapters: filteredChapters,
                selectedPublisher: publisher
            });
        } catch (error) {
            console.error('Failed to filter chapters by publisher:', error);
        } finally {
            setPublisherLoading(false);
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
                            resetImportState();
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
                            resetImportState();
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
                    <button
                        onClick={() => {
                            setActiveTab('search');
                            resetImportState();
                        }}
                        className={clsx(
                            "flex-1 h-9 rounded-lg text-sm font-bold transition-all",
                            activeTab === 'search'
                                ? "bg-white dark:bg-[#3f3b54] text-primary shadow-sm"
                                : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-300"
                        )}
                    >
                        Search
                    </button>
                </div>

                {/* Search / URL Input Section */}
                <div className="mt-4 space-y-4">
                    {activeTab === 'search' ? (
                        <div className="flex flex-col gap-2 animate-in fade-in">
                            <div className="flex items-center justify-between px-1">
                                <label className="text-sm font-medium opacity-70">Search Manga</label>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setSelectedSource('mangadex')}
                                        className={clsx(
                                            "text-[10px] font-bold px-2 py-0.5 rounded-full border transition-colors",
                                            selectedSource === 'mangadex'
                                                ? "bg-primary text-white border-primary"
                                                : "bg-transparent text-slate-500 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                                        )}
                                    >
                                        MangaDex
                                    </button>
                                    <button
                                        onClick={() => setSelectedSource('asura')}
                                        className={clsx(
                                            "text-[10px] font-bold px-2 py-0.5 rounded-full border transition-colors",
                                            selectedSource === 'asura'
                                                ? "bg-primary text-white border-primary"
                                                : "bg-transparent text-slate-500 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                                        )}
                                    >
                                        Asura Scans
                                    </button>
                                </div>
                            </div>
                            <div className="flex items-stretch bg-white dark:bg-[#1d1c27] rounded-xl border border-slate-200 dark:border-[#3f3b54] overflow-hidden focus-within:ring-2 ring-primary/50 transition-all">
                                <input
                                    className="flex-1 bg-transparent border-none text-base p-4 focus:ring-0 placeholder:text-slate-400 dark:placeholder:text-[#a19db9] outline-none"
                                    placeholder="Enter manga title (e.g. Solo Leveling)"
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            handleSearch();
                                        }
                                    }}
                                />
                                <button onClick={handleSearch} disabled={loading || isSearching} className="px-4 flex items-center justify-center text-primary border-l border-slate-100 dark:border-[#3f3b54] disabled:opacity-50">
                                    {isSearching ? <Loader2 className="animate-spin" /> : <Search />}
                                </button>
                            </div>

                            {/* Search Results */}
                            {searchResults.length > 0 && (
                                <div className="grid grid-cols-2 gap-3 mt-2">
                                    {searchResults.map((result) => (
                                        <div
                                            key={result.sourceUrl || result.title}
                                            onClick={() => {
                                                if (result.sourceUrl) {
                                                    setUrl(result.sourceUrl);
                                                    setActiveTab('manhwa'); // Switch to Manhwa tab to preview
                                                    handlePreview(result.sourceUrl);
                                                }
                                            }}
                                            className="bg-white dark:bg-[#1d1c27] rounded-xl p-2 border border-slate-200 dark:border-[#3f3b54] active:scale-95 transition-transform cursor-pointer"
                                        >
                                            <div className="aspect-[2/3] bg-cover bg-center rounded-lg mb-2 shadow-sm" style={{ backgroundImage: `url('${result.coverUrl}')` }}></div>
                                            <p className="font-bold text-xs line-clamp-2 leading-tight px-1">{result.title}</p>
                                            <p className="text-[10px] opacity-60 px-1 mt-0.5">{result.author}</p>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {searchResults.length === 0 && searchQuery && !isSearching && (
                                <div className="text-center py-8 opacity-50 text-sm">
                                    No results found
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2 animate-in fade-in">
                            <label className="text-sm font-medium opacity-70 px-1">Source URL</label>
                            <div className="flex items-stretch bg-white dark:bg-[#1d1c27] rounded-xl border border-slate-200 dark:border-[#3f3b54] overflow-hidden focus-within:ring-2 ring-primary/50 transition-all">
                                <input
                                    className="flex-1 bg-transparent border-none text-base p-4 focus:ring-0 placeholder:text-slate-400 dark:placeholder:text-[#a19db9] outline-none"
                                    placeholder={activeTab === 'novel' ? "https://novelfire.com/..." : "https://mangadex.org/..."}
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
                                <button onClick={() => handlePreview()} disabled={loading || scraping} className="px-4 flex items-center justify-center text-primary border-l border-slate-100 dark:border-[#3f3b54] disabled:opacity-50">
                                    {loading ? <Loader2 className="animate-spin" /> : <Clipboard />}
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Preview Card */}
                {novel && (
                    <div className="mt-8 animate-in fade-in slide-in-from-bottom-4">
                        <p className="text-xs font-bold uppercase tracking-widest opacity-50 mb-3 px-1">Detected Metadata</p>
                        <div className="bg-white dark:bg-[#1d1c27] rounded-xl p-4 flex gap-4 shadow-sm border border-slate-100 dark:border-[#3f3b54]">
                            <div className="w-24 h-36 rounded-lg bg-cover bg-center shadow-md flex-shrink-0" style={{ backgroundImage: `url('${novel.coverUrl}')` }}>
                            </div>
                            <div className="flex flex-col justify-between py-1 flex-1 min-w-0">
                                <div>
                                    <h3 className="text-lg font-bold leading-tight">{novel.title}</h3>
                                    <p className="text-sm opacity-60 mt-1">{novel.author}</p>
                                </div>
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 text-xs font-medium opacity-70">
                                        <Book size={14} />
                                        {publisherLoading ? 'Loading chapters...' : `${novel.chapters.length} Chapters Found`}
                                        {novel.selectedPublisher && (
                                            <span className="text-primary">({novel.selectedPublisher})</span>
                                        )}
                                    </div>
                                    <a href={url} target="_blank" rel="noreferrer" className="flex items-center justify-center w-full h-8 bg-slate-100 dark:bg-[#3f3b54] text-xs font-bold rounded-lg transition-active active:scale-95">
                                        VIEW SOURCE SITE
                                    </a>
                                </div>
                            </div>
                        </div>

                        {/* Publisher Selection for comick.art */}
                        {novel.publishers && novel.publishers.length > 0 && (
                            <div className="mt-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <Users size={14} className="text-primary" />
                                    <p className="text-xs font-bold uppercase tracking-widest opacity-50">Select Publisher</p>
                                </div>
                                <div className="relative">
                                    <button
                                        onClick={() => setShowPublisherDropdown(!showPublisherDropdown)}
                                        className="w-full flex items-center justify-between p-3 bg-white dark:bg-[#1d1c27] rounded-xl border border-slate-200 dark:border-[#3f3b54] text-sm font-medium transition-colors hover:border-primary/50"
                                    >
                                        <span className={selectedPublisher ? '' : 'opacity-50'}>
                                            {selectedPublisher || 'Choose a publisher / scanlation group...'}
                                        </span>
                                        <ChevronDown size={16} className={clsx('transition-transform', showPublisherDropdown && 'rotate-180')} />
                                    </button>

                                    {showPublisherDropdown && (
                                        <div className="absolute z-20 mt-1 w-full bg-white dark:bg-[#1d1c27] rounded-xl border border-slate-200 dark:border-[#3f3b54] shadow-lg max-h-60 overflow-y-auto">
                                            {novel.publishers.map((pub) => (
                                                <button
                                                    key={pub}
                                                    onClick={() => handlePublisherSelect(pub)}
                                                    className={clsx(
                                                        'w-full text-left px-4 py-3 text-sm font-medium transition-colors hover:bg-primary/10 first:rounded-t-xl last:rounded-b-xl',
                                                        selectedPublisher === pub && 'bg-primary/10 text-primary'
                                                    )}
                                                >
                                                    {pub}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                {!selectedPublisher && (
                                    <p className="text-xs text-amber-500 mt-2 px-1">
                                        ⚠ Please select a publisher before importing
                                    </p>
                                )}
                            </div>
                        )}
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

                {/* Success State */}
                {isImportComplete && !scraping && (
                    <div className="mt-8 animate-in zoom-in-95 fade-in duration-300">
                        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-6 flex flex-col items-center text-center">
                            <div className="w-16 h-16 bg-emerald-500 text-white rounded-full flex items-center justify-center mb-4 shadow-lg shadow-emerald-500/30">
                                <Bookmark size={32} />
                            </div>
                            <h3 className="text-xl font-bold text-emerald-600 dark:text-emerald-400">Import Complete!</h3>
                            <p className="text-sm opacity-70 mt-2 max-w-[240px]">
                                Your {activeTab === 'manhwa' ? 'manhwa' : 'novel'} has been successfully added to your library.
                            </p>
                            <button
                                onClick={resetImportState}
                                className="mt-6 px-8 h-12 bg-emerald-500 text-white rounded-xl font-bold transition-all active:scale-95 shadow-md shadow-emerald-500/20"
                            >
                                START NEW IMPORT
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Footer Actions */}
            <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-background-light dark:from-background-dark via-background-light/95 dark:via-background-dark/95 to-transparent z-10">
                <div className="flex flex-col gap-3">
                    <button
                        onClick={handleScrape}
                        disabled={!url || loading || scraping || publisherLoading || (novel?.publishers && novel.publishers.length > 0 && !selectedPublisher)}
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
