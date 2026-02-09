import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, BookOpen, CheckCircle2 } from 'lucide-react';
import clsx from 'clsx';
import type { Chapter } from '../services/db.service';

interface ChapterSidebarProps {
    isOpen: boolean;
    onClose: () => void;
    chapters: Chapter[];
    currentChapterId: string;
    novelTitle: string;
    onSelectChapter: (chapter: Chapter) => void;
}

export const ChapterSidebar = ({
    isOpen,
    onClose,
    chapters,
    currentChapterId,
    novelTitle,
    onSelectChapter
}: ChapterSidebarProps) => {
    const listRef = useRef<HTMLDivElement>(null);
    const currentChapterRef = useRef<HTMLButtonElement>(null);

    // Auto-scroll to current chapter when sidebar opens
    useEffect(() => {
        if (isOpen && currentChapterRef.current && listRef.current) {
            setTimeout(() => {
                currentChapterRef.current?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center'
                });
            }, 300);
        }
    }, [isOpen, currentChapterId]);

    const currentIndex = chapters.findIndex(c => c.id === currentChapterId);
    const remainingChapters = chapters.length - currentIndex - 1;

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
                        onClick={onClose}
                    />

                    {/* Sidebar */}
                    <motion.div
                        initial={{ x: '-100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '-100%' }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        className="fixed left-0 top-0 bottom-0 z-50 w-[85%] max-w-sm bg-white dark:bg-[#1a182b] shadow-2xl flex flex-col"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between p-4 pt-[calc(env(safe-area-inset-top)+16px)] border-b border-slate-200 dark:border-white/10">
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                                <div className="size-10 bg-primary/10 rounded-xl flex items-center justify-center flex-shrink-0">
                                    <BookOpen className="text-primary" size={20} />
                                </div>
                                <div className="min-w-0">
                                    <h2 className="font-bold text-sm dark:text-white truncate">{novelTitle}</h2>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                        {currentIndex + 1} of {chapters.length} • {remainingChapters} left
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                className="size-10 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                            >
                                <X size={20} className="text-slate-500" />
                            </button>
                        </div>

                        {/* Chapter List */}
                        <div ref={listRef} className="flex-1 overflow-y-auto overscroll-contain">
                            {chapters.map((chapter, index) => {
                                const isCurrent = chapter.id === currentChapterId;
                                const isRead = chapter.isRead;

                                return (
                                    <button
                                        key={chapter.id}
                                        ref={isCurrent ? currentChapterRef : undefined}
                                        onClick={() => {
                                            onSelectChapter(chapter);
                                            onClose();
                                        }}
                                        className={clsx(
                                            "w-full text-left px-4 py-3 border-b border-slate-100 dark:border-white/5 transition-colors flex items-center gap-3",
                                            isCurrent
                                                ? "bg-primary/10 border-l-4 border-l-primary"
                                                : "hover:bg-slate-50 dark:hover:bg-white/5 active:bg-slate-100 dark:active:bg-white/10"
                                        )}
                                    >
                                        {/* Chapter Number */}
                                        <span className={clsx(
                                            "size-8 flex items-center justify-center rounded-lg text-xs font-bold flex-shrink-0",
                                            isCurrent
                                                ? "bg-primary text-white"
                                                : isRead
                                                    ? "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400"
                                                    : "bg-slate-100 dark:bg-slate-800 text-slate-500"
                                        )}>
                                            {isRead && !isCurrent ? (
                                                <CheckCircle2 size={14} />
                                            ) : (
                                                index + 1
                                            )}
                                        </span>

                                        {/* Chapter Title */}
                                        <span className={clsx(
                                            "flex-1 text-sm line-clamp-1",
                                            isCurrent
                                                ? "font-bold text-primary"
                                                : isRead
                                                    ? "text-slate-400 dark:text-slate-500"
                                                    : "text-slate-700 dark:text-slate-200"
                                        )}>
                                            {chapter.title}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};
