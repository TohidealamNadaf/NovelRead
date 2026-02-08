import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, MoreHorizontal, Play, Pause, FastForward, Music, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { useNavigate, useParams } from 'react-router-dom';
import { dbService } from '../services/database.service';
import { audioService } from '../services/audio.service';
import { settingsService } from '../services/settings.service';
import { CompletionModal } from '../components/CompletionModal';

export const Reader = () => {
    const navigate = useNavigate();
    const { novelId, chapterId } = useParams();
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [chapter, setChapter] = useState<any>(null);
    const [nextChapter, setNextChapter] = useState<any>(null);
    const [prevChapter, setPrevChapter] = useState<any>(null);
    const [novel, setNovel] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    // Pull to Previous state
    const [pullDistance, setPullDistance] = useState(0);
    const [isPulling, setIsPulling] = useState(false);
    const touchStartRef = useRef(0);
    const PULL_THRESHOLD = 120;

    // Audio State
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isMusicPlaying, setIsMusicPlaying] = useState(false);

    // User Settings State (Global)
    const [settings, setSettings] = useState(settingsService.getSettings());
    const [showSettings, setShowSettings] = useState(false);
    const [showComingSoon, setShowComingSoon] = useState(false);

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
            // Scroll container to top on new chapter
            if (scrollContainerRef.current) {
                scrollContainerRef.current.scrollTop = 0;
            }
        }
    };

    const handleNextChapter = () => {
        if (nextChapter) {
            navigate(`/read/${novelId}/${nextChapter.id}`);
            setShowSettings(false);
        } else {
            setShowComingSoon(true);
        }
    };

    const handlePrevChapter = () => {
        if (prevChapter) {
            navigate(`/read/${novelId}/${prevChapter.id}`);
            setShowSettings(false);
        }
    };

    const handleBackToIndex = () => {
        navigate(`/novel/${novelId}`);
    };

    const handleTouchStart = (e: React.TouchEvent) => {
        if (scrollContainerRef.current?.scrollTop === 0) {
            touchStartRef.current = e.touches[0].clientY;
            setIsPulling(true);
        }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (!isPulling || !prevChapter) return;
        const currentY = e.touches[0].clientY;
        const diff = currentY - touchStartRef.current;
        if (diff > 0 && scrollContainerRef.current?.scrollTop === 0) {
            // Logarithmic feel for pulling
            const resistance = 0.5;
            setPullDistance(diff * resistance);
        } else {
            setPullDistance(0);
        }
    };

    const handleTouchEnd = () => {
        if (pullDistance > PULL_THRESHOLD && prevChapter) {
            handlePrevChapter();
        }
        setPullDistance(0);
        setIsPulling(false);
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
            // Simple heuristic for category - defaults to fantasy
            audioService.playBGM('fantasy');
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

    // Global double-click handler
    useEffect(() => {
        const handleDoubleClick = (e: MouseEvent) => {
            // Ignore double clicks on buttons, inputs, or inside the settings menu itself
            const target = e.target as HTMLElement;
            if (target.closest('button') || target.closest('input') || target.closest('.settings-menu')) {
                return;
            }
            setShowSettings(prev => !prev);
        };

        window.addEventListener('dblclick', handleDoubleClick);
        return () => window.removeEventListener('dblclick', handleDoubleClick);
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
            {/* Top App Bar */}
            <div className="sticky top-0 z-10 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800 pt-[14px]">
                <div className="flex items-center p-4 pb-2 justify-between">
                    <button onClick={handleBackToIndex} className="text-gray-900 dark:text-white flex size-12 shrink-0 items-center justify-center cursor-pointer">
                        <ArrowLeft />
                    </button>
                    <div className="flex flex-col items-center flex-1 min-w-0 px-2">
                        <h2 className="text-gray-900 dark:text-white text-sm font-bold leading-tight tracking-tight truncate w-full text-center">{chapter.title}</h2>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">Chapter {chapter.orderIndex + 1}</p>
                    </div>
                    <div className="flex w-12 items-center justify-end">
                        <button onClick={() => setShowSettings(!showSettings)} className="flex items-center justify-center size-10 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors">
                            <MoreHorizontal />
                        </button>
                    </div>
                </div>
            </div>

            {/* Main Reading Area */}
            <div
                ref={scrollContainerRef}
                className={`flex-1 overflow-y-auto px-6 py-8 ${getThemeClass()} scroll-smooth relative`}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
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
                            animate={{ y: pullDistance > PULL_THRESHOLD ? [0, -5, 0] : 0 }}
                            className="flex flex-col items-center gap-2"
                        >
                            <ChevronUp className={clsx("transition-transform duration-300", pullDistance > PULL_THRESHOLD ? "text-primary scale-125 rotate-180" : "text-gray-400")} />
                            <p className={clsx("text-[10px] font-bold uppercase tracking-widest bg-background-light dark:bg-background-dark px-3 py-1 rounded-full border border-gray-100 dark:border-gray-800", pullDistance > PULL_THRESHOLD ? "text-primary border-primary/30" : "text-gray-500")}>
                                {pullDistance > PULL_THRESHOLD ? "Release for Previous" : "Pull for Previous"}
                            </p>
                        </motion.div>
                    </motion.div>
                )}

                <AnimatePresence mode="wait">
                    <motion.div
                        key={chapter.id}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.3 }}
                        className={clsx("max-w-2xl mx-auto space-y-6 reader-text", font === 'serif' ? 'font-serif' : font === 'sans' ? 'font-sans' : '')}
                        style={{
                            fontSize: `${fontSize}rem`,
                            fontFamily: font === 'comfortable' ? 'Georgia, "Merriweather", "Palatino Linotype", "Book Antiqua", Inter, Roboto, serif' : undefined
                        }}
                    >
                        <div dangerouslySetInnerHTML={{ __html: chapter.content }} />
                    </motion.div>
                </AnimatePresence>

                <motion.div
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    className="mt-12 mb-12 flex flex-col items-center gap-6 border-t border-gray-200 dark:border-gray-800 pt-12"
                >
                    {nextChapter ? (
                        <>
                            <motion.div
                                animate={{ y: [0, 10, 0] }}
                                transition={{ repeat: Infinity, duration: 2 }}
                                className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center cursor-pointer group"
                                onClick={handleNextChapter}
                            >
                                <ChevronDown className="text-primary group-hover:scale-125 transition-transform" size={28} />
                            </motion.div>
                            <div className="text-center px-6" onClick={handleNextChapter}>
                                <p className="text-[10px] uppercase tracking-[0.3em] text-gray-500 font-bold mb-2">Next Chapter</p>
                                <h3 className="text-xl font-bold dark:text-white leading-tight">{nextChapter.title}</h3>
                                <p className="text-sm text-primary mt-2 font-medium animate-pulse">Swipe up or click to continue</p>
                            </div>
                            <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={handleNextChapter}
                                className="px-10 py-4 bg-primary text-white rounded-full font-bold shadow-xl shadow-primary/30 transition-all hover:bg-primary/90"
                            >
                                Continue Reading
                            </motion.button>
                        </>
                    ) : (
                        <div className="text-center py-10 opacity-50">
                            <p className="font-medium italic">End of current updates</p>
                            <button
                                onClick={() => navigate(-1)}
                                className="mt-4 text-primary font-bold text-sm"
                            >
                                Back to Library
                            </button>
                        </div>
                    )}
                </motion.div>

                {/* Extra Padding Removed */}
            </div>


            {/* AI Music Indicator */}
            {isMusicPlaying && (
                <div className="absolute bottom-64 left-4 bg-primary/20 backdrop-blur-md border border-primary/30 rounded-lg p-2 flex items-center gap-3 animate-in fade-in slide-in-from-left">
                    <div className="size-8 bg-primary rounded-md flex items-center justify-center">
                        <Music className="text-white text-sm animate-pulse" size={16} />
                    </div>
                    <div>
                        <p className="text-[10px] text-primary-200 uppercase font-bold tracking-tighter">AI Soundtrack</p>
                        <p className="text-xs text-white font-medium">Fantasy Ambient</p>
                    </div>
                </div>
            )}

            {/* Customization Overlay */}
            {showSettings && (
                <>
                    {/* Backdrop to close settings on click outside */}
                    <div className="fixed inset-0 z-10 bg-black/5" onClick={() => setShowSettings(false)}></div>

                    <div className="settings-menu absolute bottom-0 left-0 w-full bg-white dark:bg-[#1a182b] rounded-t-3xl shadow-2xl border-t border-white/10 z-20 animate-in slide-in-from-bottom">
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
                                                className={clsx(
                                                    "w-8 h-7 text-xs font-bold rounded shadow-sm transition-all",
                                                    fontSize === size.value
                                                        ? "bg-white dark:bg-gray-700 text-primary dark:text-white ring-1 ring-primary/20 scale-110"
                                                        : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                                                )}
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
                                    <div className="flex flex-col items-center gap-1.5 cursor-pointer" onClick={() => settingsService.updateSettings({ theme: 'light' })}>
                                        <div className={clsx("w-full aspect-video bg-white border-2 rounded-lg shadow-inner", theme === 'light' ? "border-primary" : "border-transparent")}></div>
                                        <span className={clsx("text-[10px] font-bold", theme === 'light' ? "text-primary" : "text-gray-400")}>Light</span>
                                    </div>
                                    <div className="flex flex-col items-center gap-1.5 cursor-pointer" onClick={() => settingsService.updateSettings({ theme: 'sepia' })}>
                                        <div className={clsx("w-full aspect-video bg-[#f4ecd8] border-2 rounded-lg shadow-inner", theme === 'sepia' ? "border-primary" : "border-transparent")}></div>
                                        <span className={clsx("text-[10px] font-bold", theme === 'sepia' ? "text-primary" : "text-gray-400")}>Sepia</span>
                                    </div>
                                    <div className="flex flex-col items-center gap-1.5 cursor-pointer" onClick={() => settingsService.updateSettings({ theme: 'dark' })}>
                                        <div className={clsx("w-full aspect-video bg-[#1e1e1e] border-2 rounded-lg shadow-inner", theme === 'dark' ? "border-primary" : "border-transparent")}></div>
                                        <span className={clsx("text-[10px] font-bold", theme === 'dark' ? "text-primary" : "text-gray-400")}>Dark</span>
                                    </div>
                                    <div className="flex flex-col items-center gap-1.5 cursor-pointer" onClick={() => settingsService.updateSettings({ theme: 'oled' })}>
                                        <div className={clsx("w-full aspect-video bg-black border-2 rounded-lg shadow-inner", theme === 'oled' ? "border-primary" : "border-transparent")}></div>
                                        <span className={clsx("text-[10px] font-bold", theme === 'oled' ? "text-primary" : "text-gray-400")}>OLED</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}

            <CompletionModal
                isOpen={showComingSoon}
                onClose={() => setShowComingSoon(false)}
                title="Coming Soon!"
                message="Next chapter navigation is being optimized and will be available in the next update."
            />
        </div>
    );
};
