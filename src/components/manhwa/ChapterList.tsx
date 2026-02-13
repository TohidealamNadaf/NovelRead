import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Download, CheckCircle2, ArrowUpDown, Grip, List as ListIcon, Loader2, WifiOff } from 'lucide-react';
import type { Chapter } from '../../services/db.service';
import clsx from 'clsx';
import { useVirtualizer } from '@tanstack/react-virtual';

interface ChapterListProps {
    chapters: Chapter[];
    onChapterSelect: (chapter: Chapter) => void;
    onDownload: (chapter: Chapter) => void;
    onMassDownload?: () => void;
    currentChapterId?: string;
    downloadingChapterIds?: Set<string>;
    failedChapterIds?: Set<string>;
}

const ChapterRow = React.memo(({
    chapter,
    isCurrent,
    isDownloading,
    isFailed,
    onClick,
    onDownload
}: {
    chapter: Chapter;
    isCurrent: boolean;
    isDownloading: boolean;
    isFailed: boolean;
    onClick: () => void;
    onDownload: (e: React.MouseEvent) => void;
}) => (
    <div
        onClick={onClick}
        className={clsx(
            "py-4 flex items-center justify-between group cursor-pointer active:opacity-70 transition-opacity px-6",
            isCurrent && "bg-primary/5 -mx-6 px-12 border-l-4 border-primary"
        )}
    >
        <div className="flex items-center gap-4">
            <div className={clsx(
                "h-12 w-12 rounded-lg border flex items-center justify-center overflow-hidden shrink-0 font-bold text-xs",
                isCurrent
                    ? "bg-primary text-white border-primary"
                    : "bg-slate-200 dark:bg-[#1d1c27] border-slate-200 dark:border-white/5 text-slate-400"
            )}>
                {chapter.isRead ? <CheckCircle2 size={20} className={isCurrent ? "text-white" : "text-green-500"} /> : <span>#{chapter.orderIndex + 1}</span>}
            </div>
            <div className="flex flex-col">
                <span className={clsx(
                    "text-sm font-bold",
                    chapter.isRead && !isCurrent ? "text-slate-400 dark:text-slate-500" : "text-slate-900 dark:text-white"
                )}>
                    {chapter.title}
                </span>
                {chapter.date && (
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                        {chapter.date}
                    </span>
                )}
                {!!chapter.isRead && (
                    <span className="text-[10px] text-green-600 dark:text-green-500 font-medium whitespace-nowrap">Read</span>
                )}
                {isFailed && (
                    <span className="text-[10px] text-red-500 font-medium whitespace-nowrap">Download Failed</span>
                )}
            </div>
        </div>
        <button
            onClick={onDownload}
            disabled={isDownloading || !!chapter.content}
            className={clsx(
                "p-2 -mr-2 transition-colors",
                chapter.content ? "text-green-500" : isDownloading ? "text-primary" : "text-slate-400 hover:text-primary dark:hover:text-white"
            )}
        >
            {isDownloading ? (
                <Loader2 size={20} className="animate-spin" />
            ) : chapter.content ? (
                <CheckCircle2 size={20} />
            ) : isFailed ? (
                <Download size={20} className="text-red-500" />
            ) : (
                <Download size={20} />
            )}
        </button>
    </div>
));

const ChapterGridItem = React.memo(({
    chapter,
    isCurrent,
    onClick
}: {
    chapter: Chapter;
    isCurrent: boolean;
    onClick: () => void;
}) => (
    <div
        onClick={onClick}
        className={clsx(
            "aspect-square rounded-xl border flex flex-col items-center justify-center p-2 cursor-pointer active:scale-95 transition-transform relative overflow-hidden",
            isCurrent
                ? "bg-primary/10 border-primary text-primary"
                : "bg-slate-100 dark:bg-[#1d1c27] border-slate-200 dark:border-white/5 text-slate-900 dark:text-white"
        )}
    >
        <span className={clsx(
            "text-sm font-bold text-center",
            chapter.isRead && !isCurrent && "text-slate-400 dark:text-slate-500"
        )}>
            {chapter.title.replace(/Chapter\s*/i, '')}
        </span>
        {chapter.isRead && (
            <div className="absolute top-1 right-1 text-green-500">
                <CheckCircle2 size={12} />
            </div>
        )}
        {isCurrent && (
            <div className="absolute bottom-1 text-[10px] font-bold uppercase tracking-wider text-primary">
                Current
            </div>
        )}
    </div>
));

export const ChapterList: React.FC<ChapterListProps> = ({
    chapters,
    onChapterSelect,
    onDownload,
    onMassDownload,
    currentChapterId,
    downloadingChapterIds = new Set(),
    failedChapterIds = new Set()
}) => {
    const [sortDesc, setSortDesc] = useState(true);
    const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
    const parentRef = useRef<HTMLDivElement>(null);

    const sortedChapters = useMemo(() => {
        return [...chapters].sort((a, b) => {
            return sortDesc ? b.orderIndex - a.orderIndex : a.orderIndex - b.orderIndex;
        });
    }, [chapters, sortDesc]);

    // Virtualizer setup
    const rowVirtualizer = useVirtualizer({
        count: viewMode === 'list'
            ? sortedChapters.length
            : Math.ceil(sortedChapters.length / 3), // 3 columns for grid
        getScrollElement: () => parentRef.current,
        estimateSize: () => viewMode === 'list' ? 80 : 120, // Estimated row heights
        overscan: 5,
    });

    const handleSortToggle = () => setSortDesc(!sortDesc);

    // Auto-scroll to current chapter on mount/change
    useEffect(() => {
        if (currentChapterId && sortedChapters.length > 0) {
            const index = sortedChapters.findIndex(c => c.id === currentChapterId);
            if (index !== -1) {
                const targetIndex = viewMode === 'list' ? index : Math.floor(index / 3);
                // Need a slight delay for virtualizer to be ready
                setTimeout(() => {
                    try {
                        rowVirtualizer.scrollToIndex(targetIndex, { align: 'center', behavior: 'smooth' });
                    } catch (e) {
                        // Flaky on some initial renders if container not ready
                    }
                }, 100);
            }
        }
    }, [currentChapterId, sortedChapters, rowVirtualizer, viewMode]);

    if (chapters.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                <span className="text-4xl mb-4">📭</span>
                <p className="font-medium">No chapters found</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4 h-full">
            {/* Header Controls */}
            <div className="flex items-center justify-between px-6 shrink-0">
                <div className="flex flex-col">
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">Chapters</h2>
                    <p className="text-xs text-slate-500">
                        {chapters.length} chapters
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleSortToggle}
                        className="h-9 w-9 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-[#1d1c27] border border-slate-200 dark:border-white/5 text-slate-500 dark:text-slate-300 hover:text-primary transition-colors"
                    >
                        <ArrowUpDown size={18} className={sortDesc ? "rotate-0" : "rotate-180 transition-transform"} />
                    </button>
                    <div className="flex bg-slate-100 dark:bg-[#1d1c27] border border-slate-200 dark:border-white/5 p-1 rounded-lg">
                        <button
                            onClick={() => setViewMode('list')}
                            className={clsx(
                                "h-7 w-7 flex items-center justify-center rounded-md transition-all",
                                viewMode === 'list'
                                    ? "bg-white dark:bg-white/10 text-primary dark:text-white shadow-sm"
                                    : "text-slate-400 hover:text-slate-600 dark:hover:text-white"
                            )}
                        >
                            <ListIcon size={16} />
                        </button>
                        <button
                            onClick={() => setViewMode('grid')}
                            className={clsx(
                                "h-7 w-7 flex items-center justify-center rounded-md transition-all",
                                viewMode === 'grid'
                                    ? "bg-white dark:bg-white/10 text-primary dark:text-white shadow-sm"
                                    : "text-slate-400 hover:text-slate-600 dark:hover:text-white"
                            )}
                        >
                            <Grip size={16} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Offline Banner */}
            {!navigator.onLine && (
                <div className="mx-6 flex items-center justify-between bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/5 p-3 rounded-xl">
                    <div className="flex items-center gap-3">
                        <WifiOff size={16} className="text-slate-400" />
                        <span className="text-sm font-medium text-slate-500">
                            Offline Mode
                        </span>
                    </div>
                </div>
            )}

            {/* Mass Download Banner */}
            {navigator.onLine && (
                <div className="mx-6 flex items-center justify-between bg-primary/5 border border-primary/20 p-3 rounded-xl shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                            <Download size={16} />
                        </div>
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                            Available for offline reading
                        </span>
                    </div>
                    {/* Action button */}
                    <button
                        onClick={onMassDownload}
                        disabled={downloadingChapterIds.size > 0}
                        className={clsx(
                            "text-xs font-bold bg-primary px-3 py-1.5 rounded-lg text-white shadow-sm active:scale-95 transition-transform",
                            downloadingChapterIds.size > 0 && "opacity-50 cursor-not-allowed"
                        )}
                    >
                        {downloadingChapterIds.size > 0 ? 'Downloading...' : 'Mass Download'}
                    </button>
                </div>
            )}

            {/* List Container - IMPORTANT: Needs max-height or full height for virtualization */}
            {/* The parent page usually imposes a height, but we need to ensure this container scrolls */}
            <div
                ref={parentRef}
                className={clsx(
                    "overflow-y-auto px-6 pb-24", // Standard padding
                    // We need a constrained height for virtualization to work. 
                    // Using a dynamic calculation or flex-grow is best. 
                    // For now, assuming parent flex layout or fixed viewport.
                    "h-[calc(100vh-300px)]"
                )}
            >
                <div
                    style={{
                        height: `${rowVirtualizer.getTotalSize()}px`,
                        width: '100%',
                        position: 'relative',
                    }}
                >
                    {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                        const startIndex = viewMode === 'list' ? virtualRow.index : virtualRow.index * 3;

                        if (viewMode === 'list') {
                            const chapter = sortedChapters[virtualRow.index];
                            return (
                                <div
                                    key={virtualRow.key}
                                    style={{
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        width: '100%',
                                        height: `${virtualRow.size}px`,
                                        transform: `translateY(${virtualRow.start}px)`,
                                    }}
                                >
                                    <ChapterRow
                                        chapter={chapter}
                                        isCurrent={chapter.id === currentChapterId}
                                        isDownloading={downloadingChapterIds.has(chapter.id)}
                                        isFailed={failedChapterIds.has(chapter.id)}
                                        onClick={() => onChapterSelect(chapter)}
                                        onDownload={(e) => {
                                            e.stopPropagation();
                                            onDownload(chapter);
                                        }}
                                    />
                                </div>
                            );
                        } else {
                            // Grid Row logic (3 items per virtual row)
                            const rowReviewItems = sortedChapters.slice(startIndex, startIndex + 3);
                            return (
                                <div
                                    key={virtualRow.key}
                                    style={{
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        width: '100%',
                                        height: `${virtualRow.size}px`,
                                        transform: `translateY(${virtualRow.start}px)`,
                                    }}
                                    className="grid grid-cols-3 gap-3 py-1.5"
                                >
                                    {rowReviewItems.map(chapter => (
                                        <ChapterGridItem
                                            key={chapter.id}
                                            chapter={chapter}
                                            isCurrent={chapter.id === currentChapterId}
                                            onClick={() => onChapterSelect(chapter)}
                                        />
                                    ))}
                                </div>
                            );
                        }
                    })}
                </div>
            </div>
        </div>
    );
};
