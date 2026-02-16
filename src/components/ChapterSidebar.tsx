import { useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, BookOpen, CheckCircle2, ChevronsUp, ChevronsDown } from 'lucide-react';
import clsx from 'clsx';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Chapter } from '../services/db.service';
import { memo } from 'react';

interface ChapterSidebarProps {
    isOpen: boolean;
    onClose: () => void;
    chapters: Chapter[];
    currentChapterId: string;
    currentIndex?: number; // Optional explicit index for more reliable matching
    novelTitle: string;
    onSelectChapter: (chapter: Chapter) => void;
}

// Memoized Row Component for Virtualization
const ChapterRow = memo(({
    chapter,
    index,
    isCurrent,
    isRead,
    style,
    onClick
}: {
    chapter: Chapter;
    index: number;
    isCurrent: boolean;
    isRead: boolean | undefined;
    style: React.CSSProperties;
    onClick: () => void;
}) => (
    <button
        onClick={onClick}
        style={style}
        className={clsx(
            "absolute top-0 left-0 w-full text-left px-4 py-3 border-b border-slate-100 dark:border-white/5 transition-colors flex items-center gap-3",
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
                    : "bg-slate-100 dark:border-slate-800 text-slate-500"
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
            {chapter?.title || `Chapter ${index + 1}`}
        </span>
    </button>
));

export const ChapterSidebar = ({
    isOpen,
    onClose,
    chapters,
    currentChapterId,
    currentIndex: explicitIndex,
    novelTitle,
    onSelectChapter
}: ChapterSidebarProps) => {
    const parentRef = useRef<HTMLDivElement>(null);

    // Lock body scroll when sidebar is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [isOpen]);

    const currentIndex = useMemo(() => {
        if (typeof explicitIndex === 'number' && explicitIndex >= 0) {
            return explicitIndex;
        }
        return chapters.findIndex(c => c.id === currentChapterId);
    }, [chapters, currentChapterId, explicitIndex]);

    // Virtualizer
    const rowVirtualizer = useVirtualizer({
        count: chapters.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 64, // Estimated height of a row
        overscan: 5,
    });

    // Auto-scroll to current chapter on open
    useEffect(() => {
        if (isOpen && currentIndex !== -1 && parentRef.current) {
            rowVirtualizer.scrollToIndex(currentIndex, { align: 'center' });
        }
    }, [isOpen]); // Only run when isOpen changes to true

    const scrollHelpers = {
        toTop: () => rowVirtualizer.scrollToIndex(0, { align: 'start' }),
        toBottom: () => rowVirtualizer.scrollToIndex(chapters.length - 1, { align: 'end' }),
        toCurrent: () => {
            if (currentIndex !== -1) {
                rowVirtualizer.scrollToIndex(currentIndex, { align: 'center' });
            }
        }
    };

    const remainingChapters = currentIndex !== -1 ? chapters.length - currentIndex - 1 : 0;

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
                        <div className="flex flex-col border-b border-slate-200 dark:border-white/10 bg-white dark:bg-[#1a182b] z-10">
                            <div className="flex items-center justify-between p-4 pt-[calc(env(safe-area-inset-top)+16px)]">
                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                    <div className="size-10 bg-primary/10 rounded-xl flex items-center justify-center flex-shrink-0">
                                        <BookOpen className="text-primary" size={20} />
                                    </div>
                                    <div className="min-w-0">
                                        <h2 className="font-bold text-sm dark:text-white truncate">{novelTitle}</h2>
                                        <p className="text-xs text-slate-500 dark:text-slate-400">
                                            {currentIndex !== -1 ? currentIndex + 1 : '-'} of {chapters.length} • {remainingChapters} left
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

                            {/* Quick Navigation Toolbar */}
                            <div className="flex items-center justify-between px-4 pb-3 gap-2">
                                <button
                                    onClick={scrollHelpers.toTop}
                                    className="flex-1 py-1.5 flex items-center justify-center gap-1 bg-slate-100 dark:bg-white/5 rounded-lg text-[10px] font-bold text-slate-500 uppercase active:scale-95 transition-transform"
                                >
                                    <ChevronsUp size={14} /> First
                                </button>
                                <button
                                    onClick={scrollHelpers.toCurrent}
                                    className="flex-1 py-1.5 flex items-center justify-center gap-1 bg-primary/10 rounded-lg text-[10px] font-bold text-primary uppercase active:scale-95 transition-transform"
                                >
                                    Current
                                </button>
                                <button
                                    onClick={scrollHelpers.toBottom}
                                    className="flex-1 py-1.5 flex items-center justify-center gap-1 bg-slate-100 dark:bg-white/5 rounded-lg text-[10px] font-bold text-slate-500 uppercase active:scale-95 transition-transform"
                                >
                                    Latest <ChevronsDown size={14} />
                                </button>
                            </div>
                        </div>

                        {/* Virtualized Chapter List */}
                        <div
                            ref={parentRef}
                            className="flex-1 overflow-y-auto overscroll-contain"
                        >
                            <div
                                style={{
                                    height: `${rowVirtualizer.getTotalSize()}px`,
                                    width: '100%',
                                    position: 'relative',
                                }}
                            >
                                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                                    const chapter = chapters[virtualRow.index];
                                    // Use index-based matching (more reliable after sidebar navigation) with ID fallback
                                    const isCurrent = currentIndex >= 0
                                        ? virtualRow.index === currentIndex
                                        : chapter.id === currentChapterId;

                                    return (
                                        <ChapterRow
                                            key={virtualRow.key}
                                            chapter={chapter}
                                            index={virtualRow.index}
                                            isCurrent={isCurrent}
                                            isRead={!!chapter.isRead}
                                            style={{
                                                height: `${virtualRow.size}px`,
                                                transform: `translateY(${virtualRow.start}px)`,
                                            }}
                                            onClick={() => {
                                                onSelectChapter(chapter);
                                                onClose();
                                            }}
                                        />
                                    );
                                })}
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};
