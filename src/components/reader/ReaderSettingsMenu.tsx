import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import {
    Pause,
    Play,
    RefreshCw,
    Sparkles,
    List,
    Loader2,
    Download,
    ChevronsDown,
    Minus,
    Plus,
    WandSparkles,
    Rewind,
    FastForward,
    Copy,
    Check
} from 'lucide-react';
import type { Chapter } from '../../services/db.service';
import type { AppSettings } from '../../services/settings.service';
import { FONT_SIZES, THEME_OPTIONS } from './reader.constants';

export interface ReaderSettingsMenuProps {
    isOpen: boolean;
    onClose: () => void;
    chapter: Chapter | null;
    prevChapter: Chapter | null;
    nextChapter: Chapter | null;
    isSpeaking: boolean;
    isLiveMode: boolean;
    isResyncing: boolean;
    isSavingOffline: boolean;
    isChapterSaved: boolean;
    isRewriting: boolean;
    rewriteProgress: string;
    isAutoScrolling: boolean;
    autoScrollSpeed: number;
    settings: AppSettings;
    onPrevChapter: () => void;
    onNextChapter: () => void;
    onToggleAudio: () => void;
    onOpenSidebar: () => void;
    onShowSummary: () => void;
    onRewrite: () => void;
    onResyncChapter: () => void;
    onSaveOffline: () => void;
    onToggleAutoScroll: () => void;
    onChangeAutoScrollSpeed: (speed: number) => void;
    onUpdateSettings: (newSettings: Partial<AppSettings>) => void;
}

export const ReaderSettingsMenu = ({
    isOpen,
    onClose,
    chapter,
    prevChapter,
    nextChapter,
    isSpeaking,
    isLiveMode,
    isResyncing,
    isSavingOffline,
    isChapterSaved,
    isRewriting,
    rewriteProgress,
    isAutoScrolling,
    autoScrollSpeed,
    settings,
    onPrevChapter,
    onNextChapter,
    onToggleAudio,
    onOpenSidebar,
    onShowSummary,
    onRewrite,
    onResyncChapter,
    onSaveOffline,
    onToggleAutoScroll,
    onChangeAutoScrollSpeed,
    onUpdateSettings,
}: ReaderSettingsMenuProps) => {
    const [isCopied, setIsCopied] = useState(false);

    const handleCopy = () => {
        if (!chapter?.content) return;
        const doc = new DOMParser().parseFromString(chapter.content, 'text/html');
        navigator.clipboard.writeText(doc.body.textContent || '');
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
    };

    const theme = settings.theme;
    const font = settings.fontFamily;
    const fontSize = settings.fontSize;

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop to close settings on click outside */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-10 bg-black/20 backdrop-blur-sm"
                        onClick={onClose}
                    />

                    <motion.div
                        initial={{ y: "100%" }}
                        animate={{ y: 0 }}
                        exit={{ y: "100%" }}
                        transition={{ type: "spring", damping: 25, stiffness: 200 }}
                        className="settings-menu absolute bottom-0 left-0 w-full bg-white dark:bg-[#1a182b] rounded-t-3xl shadow-2xl border-t border-white/10 z-20 overflow-hidden"
                    >
                        {/* Grab Handle */}
                        <div className="flex justify-center py-3 cursor-pointer" onClick={onClose}>
                            <div className="w-10 h-1 bg-gray-300 dark:bg-gray-700 rounded-full"></div>
                        </div>

                        <div className="px-5 pb-8 space-y-5">
                            {/* TTS & Chapter Navigation */}
                            <div className="flex items-center gap-2.5">
                                <button
                                    onClick={handleCopy}
                                    className="w-12 shrink-0 flex items-center justify-center h-12 bg-gray-100 dark:bg-gray-800 rounded-xl active:scale-95 transition-transform text-gray-700 dark:text-gray-300"
                                    title="Copy Chapter"
                                >
                                    {isCopied ? <Check size={18} className="text-green-500" /> : <Copy size={18} />}
                                </button>

                                <button
                                    onClick={onPrevChapter}
                                    disabled={!prevChapter}
                                    className={clsx(
                                        "flex-1 flex items-center justify-center gap-1.5 h-12 rounded-xl font-semibold transition-all bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm active:scale-95",
                                        !prevChapter && "opacity-30"
                                    )}
                                >
                                    <Rewind size={16} />
                                    Prev
                                </button>

                                <button
                                    onClick={onToggleAudio}
                                    disabled={!chapter?.content && !isSpeaking}
                                    className="size-14 shrink-0 flex items-center justify-center bg-primary rounded-full shadow-lg shadow-primary/30 active:scale-95 transition-transform disabled:opacity-50"
                                >
                                    {isSpeaking ? (
                                        <Pause className="text-white fill-white" size={28} />
                                    ) : (
                                        <Play className="text-white fill-white ml-0.5" size={28} />
                                    )}
                                </button>

                                <button
                                    onClick={onNextChapter}
                                    disabled={!nextChapter}
                                    className={clsx(
                                        "flex-1 flex items-center justify-center gap-1.5 h-12 rounded-xl font-semibold transition-all bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm active:scale-95",
                                        !nextChapter && "opacity-30"
                                    )}
                                >
                                    Next
                                    <FastForward size={16} />
                                </button>
                            </div>

                            {/* Quick Actions Grid */}
                            <div className="grid grid-cols-4 gap-2.5">
                                <button
                                    onClick={() => {
                                        onClose();
                                        onOpenSidebar();
                                    }}
                                    className="flex flex-col items-center justify-center gap-1.5 h-16 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold transition-colors active:scale-95"
                                >
                                    <List size={20} />
                                    <span className="text-[11px]">Contents</span>
                                </button>

                                <button
                                    onClick={onShowSummary}
                                    className="flex flex-col items-center justify-center gap-1.5 h-16 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-300 font-semibold border border-indigo-200 dark:border-indigo-800 transition-colors active:scale-95"
                                >
                                    <Sparkles size={20} />
                                    <span className="text-[11px]">Summary</span>
                                </button>

                                <button
                                    onClick={onRewrite}
                                    disabled={isRewriting || !chapter?.content}
                                    className={clsx(
                                        "flex flex-col items-center justify-center gap-1.5 h-16 rounded-xl font-semibold transition-colors active:scale-95",
                                        isRewriting || rewriteProgress
                                            ? "bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800"
                                            : "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800",
                                        (!chapter?.content) && "opacity-30"
                                    )}
                                >
                                    {isRewriting ? <Loader2 size={20} className="animate-spin" /> : <WandSparkles size={20} />}
                                    <span className="text-[11px] truncate w-full text-center px-1">
                                        {rewriteProgress || (isRewriting ? 'Rewriting...' : 'Rewrite')}
                                    </span>
                                </button>

                                {!isLiveMode && (
                                    <button
                                        onClick={onResyncChapter}
                                        disabled={isResyncing || !chapter?.audioPath}
                                        className={clsx(
                                            "flex flex-col items-center justify-center gap-1.5 h-16 rounded-xl font-semibold transition-colors active:scale-95",
                                            isResyncing
                                                ? "bg-primary/20 text-primary border border-primary/50"
                                                : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200",
                                            !chapter?.audioPath && "opacity-30"
                                        )}
                                    >
                                        <RefreshCw size={20} className={isResyncing ? "animate-spin" : ""} />
                                        <span className="text-[11px]">{isResyncing ? 'Syncing...' : 'Resync'}</span>
                                    </button>
                                )}

                                {isLiveMode && (
                                    <button
                                        onClick={onSaveOffline}
                                        disabled={isSavingOffline || isChapterSaved}
                                        className={clsx(
                                            "flex flex-col items-center justify-center gap-1.5 h-16 rounded-xl font-semibold transition-colors active:scale-95",
                                            isChapterSaved
                                                ? "bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-800"
                                                : isSavingOffline
                                                    ? "bg-primary/20 text-primary border border-primary/50"
                                                    : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                                        )}
                                    >
                                        {isSavingOffline ? (
                                            <Loader2 size={20} className="animate-spin" />
                                        ) : (
                                            <Download size={20} />
                                        )}
                                        <span className="text-[11px]">{isChapterSaved ? 'Saved' : isSavingOffline ? 'Saving...' : 'Save'}</span>
                                    </button>
                                )}
                            </div>

                            {/* Auto-Scroll Controls */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Auto Scroll</p>
                                    <button
                                        onClick={onToggleAutoScroll}
                                        className={clsx(
                                            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-95",
                                            isAutoScrolling
                                                ? "bg-primary/20 text-primary border border-primary/40"
                                                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                                        )}
                                    >
                                        <ChevronsDown size={14} className={isAutoScrolling ? "animate-bounce" : ""} />
                                        {isAutoScrolling ? 'Scrolling...' : 'Start'}
                                    </button>
                                </div>
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={() => onChangeAutoScrollSpeed(Math.max(1, autoScrollSpeed - 1))}
                                        disabled={autoScrollSpeed <= 1}
                                        className={clsx("size-8 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 transition-colors active:scale-90", autoScrollSpeed <= 1 && "opacity-30")}
                                    >
                                        <Minus size={14} />
                                    </button>
                                    <div className="flex-1 relative">
                                        <input
                                            type="range"
                                            min={1}
                                            max={10}
                                            step={1}
                                            value={autoScrollSpeed}
                                            onChange={(e) => onChangeAutoScrollSpeed(Number(e.target.value))}
                                            className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-slate-200 dark:bg-slate-700 accent-primary"
                                        />
                                        <div className="flex justify-between mt-1">
                                            <span className="text-[9px] text-slate-400">Slow</span>
                                            <span className="text-[11px] font-bold text-primary">{autoScrollSpeed}x</span>
                                            <span className="text-[9px] text-slate-400">Fast</span>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => onChangeAutoScrollSpeed(Math.min(10, autoScrollSpeed + 1))}
                                        disabled={autoScrollSpeed >= 10}
                                        className={clsx("size-8 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 transition-colors active:scale-90", autoScrollSpeed >= 10 && "opacity-30")}
                                    >
                                        <Plus size={14} />
                                    </button>
                                </div>
                            </div>

                            {/* Font & Size */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Font</p>
                                    <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
                                        <button
                                            onClick={() => onUpdateSettings({ fontFamily: 'serif' })}
                                            className={clsx("flex-1 py-2 text-xs font-bold rounded-md transition-colors", font === 'serif' ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm" : "text-gray-500")}
                                        >
                                            Serif
                                        </button>
                                        <button
                                            onClick={() => onUpdateSettings({ fontFamily: 'sans' })}
                                            className={clsx("flex-1 py-2 text-xs font-bold rounded-md transition-colors", font === 'sans' ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm" : "text-gray-500")}
                                        >
                                            Sans
                                        </button>
                                        <button
                                            onClick={() => onUpdateSettings({ fontFamily: 'comfortable' })}
                                            className={clsx("flex-1 py-2 text-xs font-bold rounded-md transition-colors", font === 'comfortable' ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm" : "text-gray-500")}
                                        >
                                            Soft
                                        </button>
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Size</p>
                                    <div className="flex items-center justify-between bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
                                        {FONT_SIZES.map((size) => (
                                            <button
                                                key={size.label}
                                                onClick={() => onUpdateSettings({ fontSize: size.value })}
                                                className={clsx(
                                                    "size-9 text-[10px] font-black rounded-lg transition-all",
                                                    fontSize === size.value
                                                        ? "bg-primary text-white shadow-md shadow-primary/30 scale-105"
                                                        : "text-gray-400 hover:text-gray-600"
                                                )}
                                            >
                                                {size.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Theme Selection */}
                            <div className="space-y-2">
                                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Theme</p>
                                <div className="grid grid-cols-4 gap-3">
                                    {THEME_OPTIONS.map((t) => (
                                        <button
                                            key={t.id}
                                            onClick={() => onUpdateSettings({ theme: t.id })}
                                            className={clsx(
                                                "group flex flex-col items-center gap-1.5",
                                                theme === t.id ? "scale-105" : "opacity-60 grayscale-[0.5]"
                                            )}
                                        >
                                            <div className={clsx(
                                                "size-11 rounded-xl border-2 transition-all",
                                                t.color,
                                                theme === t.id ? "border-primary shadow-md shadow-primary/20" : "border-transparent"
                                            )} />
                                            <span className={clsx("text-[10px] font-bold uppercase tracking-tight transition-colors", theme === t.id ? "text-primary" : "text-gray-500")}>
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
    );
};
