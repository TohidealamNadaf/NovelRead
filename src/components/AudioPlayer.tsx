import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, FastForward, Rewind, Settings, ChevronDown, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { audioService } from '../services/audio.service';
import { type Chapter, type Novel } from '../services/db.service';

interface AudioPlayerProps {
    chapter: Chapter | null;
    novel: Novel | null;
    onPrevChapter: () => void;
    onNextChapter: () => void;
    hasPrev: boolean;
    hasNext: boolean;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({
    chapter,
    novel,
    onPrevChapter,
    onNextChapter,
    hasPrev,
    hasNext
}) => {
    const [isExpanded, setIsExpanded] = useState(false);
    
    // Audio State
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [hasActiveSession, setHasActiveSession] = useState(false);

    useEffect(() => {
        const unsub = audioService.subscribe((state) => {
            setIsSpeaking(state.isTtsPlaying && !state.isTtsPaused);
            setIsPaused(state.isTtsPaused);
            setHasActiveSession(state.isTtsPlaying || state.isTtsPaused || state.currentTrack !== null);
        });
        return () => unsub();
    }, []);

    // Get the rate from audio service on mount
    useEffect(() => {
        // The rate is not in public state natively but in settings, let's just show a toggle 
        // 1.0x -> 1.5x -> 2.0x -> 0.8x -> 1.0x
    }, []);

    if (!hasActiveSession) return null;

    const togglePlayPause = (e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        if (isSpeaking) {
            audioService.pause();
        } else if (isPaused) {
            audioService.resume();
        } else if (chapter?.content) {
            audioService.speak(chapter.content, chapter.title, novel?.title || 'Unknown Novel', novel?.coverUrl);
        }
    };

    const stopPlayback = (e: React.MouseEvent) => {
        e.stopPropagation();
        audioService.stopSpeaking();
        setIsExpanded(false);
    };

    return (
        <AnimatePresence>
            {/* MINI PLAYER */}
            {!isExpanded && (
                <motion.div
                    initial={{ y: 100, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 100, opacity: 0 }}
                    onClick={() => setIsExpanded(true)}
                    className="fixed bottom-[88px] left-4 right-4 bg-white/80 dark:bg-[#1a182b]/90 backdrop-blur-xl rounded-2xl shadow-xl shadow-black/10 border border-white/20 dark:border-white/5 z-40 overflow-hidden flex items-center p-3 cursor-pointer"
                >
                    <div className="flex-1 min-w-0 pr-3">
                        <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider truncate">
                            {novel?.title || 'Novel Reader'}
                        </p>
                        <p className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate leading-tight">
                            {chapter?.title || 'Unknown Chapter'}
                        </p>
                    </div>
                    
                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            onClick={togglePlayPause}
                            className="size-10 flex items-center justify-center bg-indigo-500 rounded-full shadow-md shadow-indigo-500/20 active:scale-95 transition-transform"
                        >
                            {isSpeaking ? (
                                <Pause size={20} className="text-white fill-white" />
                            ) : (
                                <Play size={20} className="text-white fill-white ml-0.5" />
                            )}
                        </button>
                        <button
                            onClick={stopPlayback}
                            className="size-8 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 active:scale-95 transition-all"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </motion.div>
            )}

            {/* EXPANDED PLAYER (BOTTOM SHEET) */}
            {isExpanded && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setIsExpanded(false)}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
                    />

                    {/* Sheet Content */}
                    <motion.div
                        initial={{ y: '100%' }}
                        animate={{ y: 0 }}
                        exit={{ y: '100%' }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        className="fixed bottom-0 left-0 right-0 bg-white dark:bg-[#0b0f19] rounded-t-3xl shadow-2xl z-50 overflow-hidden"
                    >
                        {/* Drag Handle */}
                        <div 
                            className="w-full flex justify-center py-4 cursor-pointer"
                            onClick={() => setIsExpanded(false)}
                        >
                            <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full" />
                        </div>

                        <div className="px-6 pb-12 pt-2">
                            {/* Header / Track Info */}
                            <div className="text-center mb-8">
                                <div className="size-48 mx-auto mb-6 rounded-2xl overflow-hidden shadow-2xl shadow-black/20 relative">
                                    {novel?.coverUrl ? (
                                        <img src={novel.coverUrl} alt="Cover" className="size-full object-cover" />
                                    ) : (
                                        <div className="size-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                                            <span className="text-4xl">📖</span>
                                        </div>
                                    )}
                                </div>
                                <h3 className="text-2xl font-black text-slate-800 dark:text-white leading-tight mb-2">
                                    {chapter?.title}
                                </h3>
                                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                                    {novel?.title}
                                </p>
                            </div>

                            {/* Main Controls */}
                            <div className="flex items-center justify-center gap-6 mb-8">
                                <button
                                    onClick={onPrevChapter}
                                    disabled={!hasPrev}
                                    className="size-14 flex items-center justify-center text-slate-800 dark:text-white disabled:opacity-30 active:scale-95 transition-transform"
                                >
                                    <Rewind size={32} className="fill-current" />
                                </button>

                                <button
                                    onClick={togglePlayPause}
                                    className="size-20 flex items-center justify-center bg-indigo-500 text-white rounded-full shadow-xl shadow-indigo-500/30 active:scale-95 transition-transform"
                                >
                                    {isSpeaking ? (
                                        <Pause size={40} className="fill-white" />
                                    ) : (
                                        <Play size={40} className="fill-white ml-2" />
                                    )}
                                </button>

                                <button
                                    onClick={onNextChapter}
                                    disabled={!hasNext}
                                    className="size-14 flex items-center justify-center text-slate-800 dark:text-white disabled:opacity-30 active:scale-95 transition-transform"
                                >
                                    <FastForward size={32} className="fill-current" />
                                </button>
                            </div>

                            {/* Secondary Controls (Speed & Settings) */}
                            <div className="flex items-center justify-between px-4">
                                <Link 
                                    to="/audio"
                                    onClick={() => setIsExpanded(false)}
                                    className="flex items-center justify-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-full text-xs font-bold text-slate-600 dark:text-slate-300 active:scale-95 transition-all"
                                >
                                    <Settings size={14} />
                                    Voice Settings
                                </Link>
                                
                                {/* We don't have direct access to rate in AudioPlayer easily without settingsService, so we just link to audio settings or add it later if needed */}
                                <button
                                    onClick={() => setIsExpanded(false)}
                                    className="flex items-center justify-center size-10 bg-slate-100 dark:bg-slate-800 rounded-full text-slate-600 dark:text-slate-300 active:scale-95 transition-all"
                                >
                                    <ChevronDown size={20} />
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};
