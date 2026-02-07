import { useState, useEffect } from 'react';
import { ArrowLeft, MoreHorizontal, Play, Pause, FastForward, Music } from 'lucide-react';
import clsx from 'clsx';
import { useNavigate, useParams } from 'react-router-dom';
import { dbService } from '../services/database.service';
import { audioService } from '../services/audio.service';

export const Reader = () => {
    const navigate = useNavigate();
    const { novelId, chapterId } = useParams();
    const [chapter, setChapter] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    // Audio State
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isMusicPlaying, setIsMusicPlaying] = useState(false);

    // User Settings State
    const [theme, setTheme] = useState<'light' | 'sepia' | 'dark' | 'oled'>('dark');
    const [font, setFont] = useState<'serif' | 'sans'>('serif');
    const [fontSize, setFontSize] = useState(1.125); // 1.125rem = text-lg
    const [showSettings, setShowSettings] = useState(false);

    useEffect(() => {
        if (novelId && chapterId) {
            loadChapter(novelId, chapterId);
        }
        return () => {
            audioService.stopSpeaking();
            audioService.stopBGM();
        };
    }, [novelId, chapterId]);

    const loadChapter = async (nid: string, cid: string) => {
        setLoading(true);
        try {
            await dbService.initialize();
            const data = await dbService.getChapter(nid, cid);
            setChapter(data);
        } catch (error) {
            console.error("Failed to load chapter", error);
        } finally {
            setLoading(false);
        }
    };

    const handleNextChapter = async () => {
        alert("Next chapter navigation to be implemented");
    };

    const handlePrevChapter = () => {
        navigate(-1);
    }

    const toggleTTS = () => {
        if (isSpeaking) {
            audioService.pauseSpeaking();
            setIsSpeaking(false);
        } else {
            if (audioService.isSpeaking()) {
                audioService.resumeSpeaking();
            } else if (chapter?.content) {
                audioService.speak(chapter.content);
            }
            setIsSpeaking(true);
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
        <div className={`relative flex h-screen w-full flex-col bg-background-light dark:bg-background-dark overflow-hidden ${getThemeClass()}`}>
            {/* Top App Bar */}
            <div className="flex items-center bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md p-4 pb-2 justify-between sticky top-0 z-10 border-b border-gray-200 dark:border-gray-800">
                <button onClick={handlePrevChapter} className="text-gray-900 dark:text-white flex size-12 shrink-0 items-center justify-center cursor-pointer">
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

            {/* Main Reading Area */}
            <div className={`flex-1 overflow-y-auto px-6 py-8 ${getThemeClass()}`}>
                <div className={clsx("max-w-2xl mx-auto space-y-6 reader-text", font === 'serif' ? 'font-serif' : 'font-sans')} style={{ fontSize: `${fontSize}rem` }}>
                    <div dangerouslySetInnerHTML={{ __html: chapter.content }} />
                </div>
                {/* Bottom Padding for Scrubber/HUD */}
                <div className="h-40"></div>
            </div>

            {/* Mood Indicator */}
            <div className="absolute top-20 right-4 flex items-center gap-2 bg-black/40 backdrop-blur-xl border border-white/10 rounded-full px-3 py-1.5 shadow-lg">
                <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-[10px] font-bold tracking-widest uppercase text-white">Mood: Calm</span>
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
                <div className="absolute bottom-0 left-0 w-full bg-white dark:bg-[#1a182b] rounded-t-3xl shadow-2xl border-t border-white/10 z-20 animate-in slide-in-from-bottom">
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
                            <button onClick={handleNextChapter} className="flex-1 flex items-center justify-center gap-2 bg-gray-100 dark:bg-gray-800 h-12 rounded-xl text-gray-900 dark:text-white font-semibold">
                                <FastForward size={20} />
                            </button>
                        </div>

                        {/* Font Customization */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Font Style</p>
                                <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
                                    <button
                                        onClick={() => setFont('serif')}
                                        className={clsx("flex-1 py-1.5 text-xs font-bold rounded shadow-sm transition-colors", font === 'serif' ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white" : "text-gray-500")}
                                    >
                                        Serif
                                    </button>
                                    <button
                                        onClick={() => setFont('sans')}
                                        className={clsx("flex-1 py-1.5 text-xs font-bold rounded shadow-sm transition-colors", font === 'sans' ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white" : "text-gray-500")}
                                    >
                                        Sans
                                    </button>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Font Size</p>
                                <div className="flex items-center gap-3">
                                    <span className="text-xs font-bold text-gray-500">A</span>
                                    {/* Font Size Slider */}
                                    <div className="flex-1 relative h-6 flex items-center cursor-pointer select-none touch-none"
                                        onClick={(e) => {
                                            const rect = e.currentTarget.getBoundingClientRect();
                                            const percentage = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                                            // Map percentage to font size range: 0.8 to 2.0
                                            const newSize = 0.8 + (percentage * 1.2);
                                            setFontSize(Math.round(newSize * 10) / 10);
                                        }}
                                    >
                                        <div className="absolute w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full"></div>
                                        <div
                                            className="absolute h-1.5 bg-primary rounded-full"
                                            style={{ width: `${((fontSize - 0.8) / 1.2) * 100}%` }}
                                        ></div>
                                        <div
                                            className="absolute size-4 bg-primary rounded-full border-2 border-white shadow-md transition-transform active:scale-110"
                                            style={{ left: `${((fontSize - 0.8) / 1.2) * 100}%`, transform: 'translateX(-50%)' }}
                                        ></div>
                                    </div>
                                    <span className="text-lg font-bold text-gray-500">A</span>
                                </div>
                            </div>
                        </div>

                        {/* Theme Selection */}
                        <div className="space-y-3">
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Reading Theme</p>
                            <div className="grid grid-cols-4 gap-3">
                                <div className="flex flex-col items-center gap-1.5 cursor-pointer" onClick={() => setTheme('light')}>
                                    <div className={clsx("w-full aspect-video bg-white border-2 rounded-lg shadow-inner", theme === 'light' ? "border-primary" : "border-transparent")}></div>
                                    <span className={clsx("text-[10px] font-bold", theme === 'light' ? "text-primary" : "text-gray-400")}>Light</span>
                                </div>
                                <div className="flex flex-col items-center gap-1.5 cursor-pointer" onClick={() => setTheme('sepia')}>
                                    <div className={clsx("w-full aspect-video bg-[#f4ecd8] border-2 rounded-lg shadow-inner", theme === 'sepia' ? "border-primary" : "border-transparent")}></div>
                                    <span className={clsx("text-[10px] font-bold", theme === 'sepia' ? "text-primary" : "text-gray-400")}>Sepia</span>
                                </div>
                                <div className="flex flex-col items-center gap-1.5 cursor-pointer" onClick={() => setTheme('dark')}>
                                    <div className={clsx("w-full aspect-video bg-[#1e1e1e] border-2 rounded-lg shadow-inner", theme === 'dark' ? "border-primary" : "border-transparent")}></div>
                                    <span className={clsx("text-[10px] font-bold", theme === 'dark' ? "text-primary" : "text-gray-400")}>Dark</span>
                                </div>
                                <div className="flex flex-col items-center gap-1.5 cursor-pointer" onClick={() => setTheme('oled')}>
                                    <div className={clsx("w-full aspect-video bg-black border-2 rounded-lg shadow-inner", theme === 'oled' ? "border-primary" : "border-transparent")}></div>
                                    <span className={clsx("text-[10px] font-bold", theme === 'oled' ? "text-primary" : "text-gray-400")}>OLED</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
