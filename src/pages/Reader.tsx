import { useState, useEffect, useRef, useCallback } from 'react';
import { MoreHorizontal, Play, Pause, FastForward, Music, ChevronDown, ChevronUp, RefreshCw, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { useNavigate, useParams } from 'react-router-dom';
import { dbService, type Novel, type Chapter } from '../services/db.service';
import { audioService } from '../services/audio.service';
import { settingsService } from '../services/settings.service';
import { scraperService } from '../services/scraper.service';
import { CompletionModal } from '../components/CompletionModal';
import { SummaryModal } from '../components/SummaryModal';
import { summarizerService } from '../services/summarizer.service';
import { Header } from '../components/Header';
import { useChapterPullNavigation } from '../hooks/useChapterPullNavigation';

export const Reader = () => {
    const navigate = useNavigate();
    const { novelId, chapterId } = useParams();
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [chapter, setChapter] = useState<Chapter | null>(null);
    const [nextChapter, setNextChapter] = useState<Chapter | null>(null);
    const [prevChapter, setPrevChapter] = useState<Chapter | null>(null);
    const [novel, setNovel] = useState<Novel | null>(null);
    const [loading, setLoading] = useState(true);

    // Visual indicators state (Decoupled from core gesture logic)
    const [pullDistance, setPullDistance] = useState(0);
    const [pushDistance, setPushDistance] = useState(0);
    const [navigationDirection, setNavigationDirection] = useState<'next' | 'prev' | null>(null);
    const PULL_THRESHOLD = 80;

    // Audio State
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isMusicPlaying, setIsMusicPlaying] = useState(false);

    // User Settings State (Global)
    const [settings, setSettings] = useState(settingsService.getSettings());
    const [showSettings, setShowSettings] = useState(false);
    const [showComingSoon, setShowComingSoon] = useState(false);
    const [isResyncing, setIsResyncing] = useState(false);

    // Summary State
    const [showSummary, setShowSummary] = useState(false);
    const [summaryData, setSummaryData] = useState<{ extractive: string; events: string[] } | null>(null);
    const [isSummarizing, setIsSummarizing] = useState(false);

    const theme = settings.theme;
    const font = settings.fontFamily;
    const fontSize = settings.fontSize;

    useEffect(() => {
        if (novelId && chapterId) {
            loadData(novelId, chapterId);
        }

        // Sync with global audio state
        const audioUnsub = audioService.subscribe((state) => {
            setIsSpeaking(state.isTtsPlaying);
            setIsMusicPlaying(state.isBgmPlaying);
        });

        // Sync with global app settings
        const settingsUnsub = settingsService.subscribe((newSettings) => {
            setSettings(newSettings);
        });

        return () => {
            audioUnsub();
            settingsUnsub();
        };
    }, [novelId, chapterId]);

    const loadData = async (nid: string, cid: string) => {
        setLoading(true);
        try {
            await dbService.initialize();
            const cData = await dbService.getChapter(nid, cid);
            setChapter(cData);
            const nData = await dbService.getNovel(nid);
            setNovel(nData);

            if (cData) {
                // Fetch surrounding chapters
                const [next, prev] = await Promise.all([
                    dbService.getNextChapter(nid, cData.orderIndex),
                    dbService.getPrevChapter(nid, cData.orderIndex)
                ]);
                setNextChapter(next);
                setPrevChapter(prev);

                // Update progress
                await dbService.updateReadingProgress(nid, cid);
            }
        } catch (error) {
            console.error("Failed to load data", error);
        } finally {
            setLoading(false);
            // NOTE: Automatic scroll-to-top removed here.
            // Scroll restoration is now handled by useChapterPullNavigation hook
            // to support multi-directional (top/bottom) positioning.
        }
    };

    const handleNextChapter = useCallback(() => {
        if (nextChapter) {
            setNavigationDirection('next');
            navigate(`/read/${novelId}/${nextChapter.id}`);
            setShowSettings(false);
        } else {
            setShowComingSoon(true);
        }
    }, [nextChapter, novelId, navigate]);

    const handlePrevChapter = useCallback(() => {
        if (prevChapter) {
            setNavigationDirection('prev');
            navigate(`/read/${novelId}/${prevChapter.id}`);
            setShowSettings(false);
        }
    }, [prevChapter, novelId, navigate]);

    // STABLE GESTURE NAVIGATION SYSTEM (FSM + Async Locking)
    const { onTouchStart, onTouchMove, onTouchEnd } = useChapterPullNavigation({
        containerRef: scrollContainerRef,
        hasPrev: !!prevChapter,
        hasNext: !!nextChapter,
        onLoadPrev: handlePrevChapter,
        onLoadNext: handleNextChapter,
        activeChapterId: chapterId,
        isLoading: loading,
        onPulling: (dist, dir) => {
            // Update visual indicators based on normalized distance
            const resistance = 0.45;
            if (dir === 'prev') {
                setPullDistance(dist * resistance);
                setPushDistance(0);
            } else if (dir === 'next') {
                setPushDistance(dist * resistance);
                setPullDistance(0);
            } else {
                setPullDistance(0);
                setPushDistance(0);
            }
        }
    });

    const handleBackToIndex = () => {
        navigate(`/novel/${novelId}`);
    };

    // Resync chapter content handler
    const handleResyncChapter = async () => {
        // audioPath stores the original chapter URL
        if (!chapter?.audioPath || isResyncing) return;
        setIsResyncing(true);
        try {
            const newContent = await scraperService.fetchChapterContent(chapter.audioPath);
            if (newContent && newContent.length > 100) {
                await dbService.updateChapterContent(novelId!, chapter.id, newContent);
                // Reload the chapter
                const updatedChapter = await dbService.getChapter(novelId!, chapter.id);
                setChapter(updatedChapter);
            }
        } catch (error) {
            console.error('Failed to resync chapter:', error);
        } finally {
            setIsResyncing(false);
        }
    };


    const toggleTTS = () => {
        if (isSpeaking) {
            audioService.pauseSpeaking();
        } else {
            if (audioService.isSpeaking()) {
                audioService.resumeSpeaking();
            } else if (chapter?.content) {
                // Ensure content is loaded and strip minimal HTML if needed, though audioService handles it
                audioService.speak(chapter.content, chapter.title, novel?.title || 'Unknown Novel', novel?.coverUrl);
            }
        }
    };

    const toggleMusic = () => {
        if (isMusicPlaying) {
            audioService.stopBGM();
            setIsMusicPlaying(false);
        } else {
            const currentAmbience = audioService.getAmbienceTrack();
            if (currentAmbience) {
                audioService.playAmbience(currentAmbience);
            } else {
                audioService.playBGM('fantasy');
            }
            setIsMusicPlaying(true);
        }
    };

    const getThemeClass = () => {
        switch (theme) {
            case 'sepia': return 'reader-content-sepia';
            case 'light': return 'reader-content-light';
            case 'oled': return 'reader-content-oled';
            default: return 'reader-content-dark';
        }
    };

    const handleShowSummary = async () => {
        if (!chapter || !chapter.content) return;

        setShowSettings(false);
        setShowSummary(true);

        // Check if we already have it in memory or DB
        if (summaryData && summaryData.extractive) return;

        setIsSummarizing(true);
        try {
            // 1. Check DB for cached summary
            const cachedExtractive = await dbService.getSummary(chapter.id, 'extractive');
            const cachedEventsStr = await dbService.getSummary(chapter.id, 'events');

            if (cachedExtractive && cachedEventsStr) {
                setSummaryData({
                    extractive: cachedExtractive,
                    events: JSON.parse(cachedEventsStr)
                });
            } else {
                // 2. Generate if not found (strip HTML for processing)
                const div = document.createElement('div');
                div.innerHTML = chapter.content;
                const textContent = div.textContent || div.innerText || '';

                const result = summarizerService.summarize(textContent);
                setSummaryData(result);

                // 3. Save to DB
                await Promise.all([
                    dbService.saveSummary(chapter.id, 'extractive', result.extractive),
                    dbService.saveSummary(chapter.id, 'events', JSON.stringify(result.events))
                ]);
            }
        } catch (error) {
            console.error("Summary generation failed", error);
        } finally {
            setIsSummarizing(false);
        }
    };

    // Mobile-friendly double-tap detector
    const lastTapRef = useRef<number>(0);
    const handleDoubleTap = useCallback((e: React.MouseEvent | React.TouchEvent) => {
        const target = e.target as HTMLElement;
        // Ignore taps on interactive elements
        if (target.closest('button') || target.closest('input') || target.closest('.settings-menu') || target.closest('a')) {
            return;
        }

        const now = Date.now();
        const DOUBLE_TAP_DELAY = 300;
        if (now - lastTapRef.current < DOUBLE_TAP_DELAY) {
            setShowSettings(prev => !prev);
            lastTapRef.current = 0; // Reset
        } else {
            lastTapRef.current = now;
        }
    }, []);

    const fontSizes = [
        { label: '12', value: 0.75 },
        { label: '14', value: 0.875 },
        { label: '16', value: 1 },
        { label: '18', value: 1.125 },
        { label: '22', value: 1.375 },
    ];

    if (loading) {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-background-light dark:bg-background-dark text-primary">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
        );
    }

    if (!chapter) {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-background-light dark:bg-background-dark flex-col gap-4">
                <p className="text-xl font-bold opacity-50">Chapter not found</p>
                <button onClick={() => navigate(-1)} className="text-primary font-bold">Go Back</button>
            </div>
        );
    }

    return (
        <div
            className={`relative flex h-screen w-full flex-col bg-background-light dark:bg-background-dark overflow-hidden ${getThemeClass()}`}
        >
            {/* Top App Bar using Global Header */}
            <Header
                title={chapter.title}
                subtitle={`Chapter ${chapter.orderIndex + 1}`}
                showBack={true}
                onBack={handleBackToIndex}
                transparent
                withBorder
                className="bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md"
                rightActions={
                    <button onClick={() => setShowSettings(!showSettings)} className="flex items-center justify-center size-10 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors">
                        <MoreHorizontal />
                    </button>
                }
            />

            {/* Main Reading Area */}
            <div
                ref={scrollContainerRef}
                className={`flex-1 overflow-y-auto px-6 py-8 ${getThemeClass()} relative`}
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={(e) => {
                    handleDoubleTap(e);
                    onTouchEnd(e);
                }}
                onClick={handleDoubleTap}
                onScroll={(e) => {
                    const target = e.currentTarget;
                    if (nextChapter && target.scrollHeight - target.scrollTop - target.clientHeight < 50) {
                        // Near bottom - could trigger auto-load or show hint
                    }
                }}
            >
                {/* Pull to Previous Indicator */}
                {prevChapter && pullDistance > 10 && (
                    <motion.div
                        style={{ height: pullDistance, opacity: Math.min(pullDistance / PULL_THRESHOLD, 1) }}
                        className="flex flex-col items-center justify-end pb-4 overflow-hidden pointer-events-none"
                    >
                        <motion.div
                            animate={{ y: pullDistance > PULL_THRESHOLD ? [0, -4, 0] : 0 }}
                            className="flex flex-col items-center gap-1.5"
                        >
                            <ChevronDown className={clsx("transition-all duration-300", pullDistance > PULL_THRESHOLD ? "text-primary scale-125 rotate-180" : "text-gray-400")} />
                            <p className={clsx("text-[10px] font-black uppercase tracking-[0.2em] bg-background-light dark:bg-background-dark px-4 py-1.5 rounded-full border shadow-sm transition-colors", pullDistance > PULL_THRESHOLD ? "text-primary border-primary/40 shadow-primary/10" : "text-gray-500 border-gray-100 dark:border-gray-800")}>
                                {pullDistance > PULL_THRESHOLD ? "Release" : "Pull for Prev"}
                            </p>
                        </motion.div>
                    </motion.div>
                )}

                <AnimatePresence mode="wait" initial={false} custom={navigationDirection}>
                    <motion.div
                        key={chapter.id}
                        custom={navigationDirection}
                        variants={{
                            initial: (direction: string) => ({
                                opacity: 0,
                                y: direction === 'next' ? 50 : direction === 'prev' ? -50 : 0,
                                scale: 0.98
                            }),
                            animate: { opacity: 1, y: 0, scale: 1 },
                            exit: (direction: string) => ({
                                opacity: 0,
                                y: direction === 'next' ? -50 : direction === 'prev' ? 50 : 0,
                                scale: 0.98
                            })
                        }}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        transition={{ duration: 0.3, ease: "easeOut" }}
                        className={clsx("max-w-2xl mx-auto space-y-6 reader-text", font === 'serif' ? 'font-serif' : font === 'sans' ? 'font-sans' : '')}
                        style={{
                            fontSize: `${fontSize}rem`,
                            fontFamily: font === 'comfortable' ? 'Georgia, "Merriweather", "Palatino Linotype", "Book Antiqua", Inter, Roboto, serif' : undefined
                        }}
                    >
                        <div dangerouslySetInnerHTML={{ __html: chapter.content || '' }} />
                    </motion.div>
                </AnimatePresence>



                {/* Pull Up to Next Indicator */}
                {nextChapter && (
                    <motion.div
                        style={{ height: pushDistance, opacity: Math.min(pushDistance / PULL_THRESHOLD, 1) }}
                        className="flex flex-col items-center justify-start pt-4 overflow-hidden pointer-events-none"
                    >
                        <motion.div
                            animate={{ y: pushDistance > PULL_THRESHOLD ? [0, 4, 0] : 0 }}
                            className="flex flex-col items-center gap-1.5"
                        >
                            <p className={clsx("text-[10px] font-black uppercase tracking-[0.2em] bg-background-light dark:bg-background-dark px-4 py-1.5 rounded-full border shadow-sm transition-colors", pushDistance > PULL_THRESHOLD ? "text-primary border-primary/40 shadow-primary/10" : "text-gray-500 border-gray-100 dark:border-gray-800")}>
                                {pushDistance > PULL_THRESHOLD ? "Release" : "Pull for Next"}
                            </p>
                            <ChevronUp className={clsx("transition-all duration-300", pushDistance > PULL_THRESHOLD ? "text-primary scale-125 rotate-180" : "text-gray-400")} />
                        </motion.div>
                    </motion.div>
                )}

                {/* Extra Padding Removed */}
            </div>


            {/* AI Music Indicator */}
            {
                isMusicPlaying && (
                    <div className="absolute bottom-64 left-4 bg-primary/20 backdrop-blur-md border border-primary/30 rounded-lg p-2 flex items-center gap-3 animate-in fade-in slide-in-from-left">
                        <div className="size-8 bg-primary rounded-md flex items-center justify-center">
                            <Music className="text-white text-sm animate-pulse" size={16} />
                        </div>
                        <div>
                            <p className="text-[10px] text-primary-200 uppercase font-bold tracking-tighter">AI Soundtrack</p>
                            <p className="text-xs text-white font-medium">Fantasy Ambient</p>
                        </div>
                    </div>
                )
            }

            {/* Customization Overlay */}
            <AnimatePresence>
                {showSettings && (
                    <>
                        {/* Backdrop to close settings on click outside */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-10 bg-black/20 backdrop-blur-sm"
                            onClick={() => setShowSettings(false)}
                        />

                        <motion.div
                            initial={{ y: "100%" }}
                            animate={{ y: 0 }}
                            exit={{ y: "100%" }}
                            transition={{ type: "spring", damping: 25, stiffness: 200 }}
                            className="settings-menu absolute bottom-0 left-0 w-full bg-white dark:bg-[#1a182b] rounded-t-3xl shadow-2xl border-t border-white/10 z-20 overflow-hidden"
                        >
                            {/* Grab Handle */}
                            <div className="flex justify-center py-3" onClick={() => setShowSettings(false)}>
                                <div className="w-10 h-1 bg-gray-300 dark:bg-gray-700 rounded-full"></div>
                            </div>
                            <div className="px-6 pb-10 space-y-6">
                                {/* TTS Controls */}
                                <div className="flex items-center justify-between gap-4">
                                    <button onClick={toggleMusic} className={clsx("flex-1 flex items-center justify-center gap-2 h-12 rounded-xl  font-semibold transition-colors", isMusicPlaying ? "bg-primary/20 text-primary border border-primary/50" : "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white")}>
                                        <Music size={20} />
                                        <span className="text-xs">{isMusicPlaying ? 'On' : 'Off'}</span>
                                    </button>
                                    <button onClick={toggleTTS} className="size-16 flex items-center justify-center bg-primary rounded-full shadow-lg shadow-primary/40 active:scale-95 transition-transform">
                                        {isSpeaking ? <Pause className="text-white fill-white ml-1" size={32} /> : <Play className="text-white fill-white ml-1" size={32} />}
                                    </button>
                                    <button
                                        onClick={handleNextChapter}
                                        disabled={!nextChapter}
                                        className={clsx("flex-1 flex items-center justify-center gap-2 h-12 rounded-xl text-gray-900 dark:text-white font-semibold transition-opacity px-4 bg-gray-100 dark:bg-gray-800", !nextChapter && "opacity-30")}
                                    >
                                        <FastForward size={20} />
                                        <span className="text-xs">Next</span>
                                    </button>
                                </div>

                                {/* Summary Button */}
                                <button
                                    onClick={handleShowSummary}
                                    className="w-full flex items-center justify-center gap-2 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-300 font-bold border border-indigo-200 dark:border-indigo-800 transition-colors"
                                >
                                    <Sparkles size={18} />
                                    <span className="text-sm">Quick Chapter Overview</span>
                                </button>

                                {/* Resync Chapter Button */}
                                <button
                                    onClick={handleResyncChapter}
                                    disabled={isResyncing || !chapter?.audioPath}
                                    className={clsx(
                                        "w-full flex items-center justify-center gap-2 h-12 rounded-xl font-semibold transition-colors",
                                        isResyncing
                                            ? "bg-primary/20 text-primary border border-primary/50"
                                            : "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white",
                                        !chapter?.audioPath && "opacity-30"
                                    )}
                                >
                                    <RefreshCw size={20} className={isResyncing ? "animate-spin" : ""} />
                                    <span className="text-sm">{isResyncing ? 'Resyncing Chapter...' : 'Resync Chapter'}</span>
                                </button>

                                {/* Font Customization */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Font Style</p>
                                        <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
                                            <button
                                                onClick={() => settingsService.updateSettings({ fontFamily: 'serif' })}
                                                className={clsx("flex-1 py-1.5 text-xs font-bold rounded shadow-sm transition-colors", font === 'serif' ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white" : "text-gray-500")}
                                            >
                                                Serif
                                            </button>
                                            <button
                                                onClick={() => settingsService.updateSettings({ fontFamily: 'sans' })}
                                                className={clsx("flex-1 py-1.5 text-xs font-bold rounded shadow-sm transition-colors", font === 'sans' ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white" : "text-gray-500")}
                                            >
                                                Sans
                                            </button>
                                            <button
                                                onClick={() => settingsService.updateSettings({ fontFamily: 'comfortable' })}
                                                className={clsx("flex-1 py-1.5 text-xs font-bold rounded shadow-sm transition-colors", font === 'comfortable' ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white" : "text-gray-500")}
                                            >
                                                Soft
                                            </button>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Font Size (px)</p>
                                        <div className="flex items-center justify-between bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
                                            {fontSizes.map((size) => (
                                                <button
                                                    key={size.label}
                                                    onClick={() => settingsService.updateSettings({ fontSize: size.value })}
                                                    className={clsx("size-8 text-[10px] font-black rounded-lg transition-all", fontSize === size.value ? "bg-primary text-white shadow-lg shadow-primary/30 scale-110" : "text-gray-400 hover:text-gray-600")}
                                                >
                                                    {size.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* Theme Selection */}
                                <div className="space-y-3">
                                    <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Reading Theme</p>
                                    <div className="grid grid-cols-4 gap-3">
                                        {[
                                            { id: 'light', color: 'bg-white', label: 'Paper' },
                                            { id: 'sepia', color: 'bg-[#f4ecd8]', label: 'Sepia' },
                                            { id: 'dark', color: 'bg-[#1e1e1e]', label: 'Eclipse' },
                                            { id: 'oled', color: 'bg-black', label: 'OLED' },
                                        ].map((t) => (
                                            <button
                                                key={t.id}
                                                onClick={() => settingsService.updateSettings({ theme: t.id as any })}
                                                className={clsx(
                                                    "group flex flex-col items-center gap-2",
                                                    theme === t.id ? "scale-105" : "opacity-60 grayscale-[0.5]"
                                                )}
                                            >
                                                <div className={clsx(
                                                    "size-12 rounded-2xl border-2 transition-all",
                                                    t.color,
                                                    theme === t.id ? "border-primary shadow-lg shadow-primary/20" : "border-transparent"
                                                )} />
                                                <span className={clsx("text-[10px] font-bold uppercase tracking-tighter transition-colors", theme === t.id ? "text-primary" : "text-gray-500")}>
                                                    {t.label}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            <CompletionModal
                isOpen={showComingSoon}
                onClose={() => setShowComingSoon(false)}
                title="Coming Soon!"
                message="Next chapter navigation is being optimized and will be available in the next update."
            />

            <SummaryModal
                isOpen={showSummary}
                onClose={() => setShowSummary(false)}
                summary={summaryData}
                isLoading={isSummarizing}
            />
        </div >
    );
};
