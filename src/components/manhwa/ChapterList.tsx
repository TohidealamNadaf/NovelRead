import React, { useMemo, useState } from 'react';
import { Download, CheckCircle2, ArrowUpDown, Grip, List as ListIcon } from 'lucide-react';
import type { Chapter } from '../../services/db.service';
import clsx from 'clsx';

interface ChapterListProps {
    chapters: Chapter[];
    onChapterSelect: (chapter: Chapter) => void;
    onDownload: (chapter: Chapter) => void;
    currentChapterId?: string;
}

export const ChapterList: React.FC<ChapterListProps> = ({
    chapters,
    onChapterSelect,
    onDownload,
    // currentChapterId // Consumed if needed for scroll or other highlight logic
}) => {
    const [sortDesc, setSortDesc] = useState(true);
    const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

    const sortedChapters = useMemo(() => {
        return [...chapters].sort((a, b) => {
            return sortDesc ? b.orderIndex - a.orderIndex : a.orderIndex - b.orderIndex;
        });
    }, [chapters, sortDesc]);

    const handleSortToggle = () => setSortDesc(!sortDesc);

    return (
        <div className="flex flex-col gap-4">
            {/* Header Controls */}
            <div className="flex items-center justify-between px-6">
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

            {/* Mass Download Banner */}
            <div className="mx-6 flex items-center justify-between bg-primary/5 border border-primary/20 p-3 rounded-xl">
                <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                        <Download size={16} />
                    </div>
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                        Available for offline reading
                    </span>
                </div>
                {/* Placeholder action */}
                <button className="text-xs font-bold bg-primary px-3 py-1.5 rounded-lg text-white shadow-sm active:scale-95 transition-transform">
                    Mass Download
                </button>
            </div>

            {/* List */}
            <div className={clsx(
                "px-6 pb-24",
                viewMode === 'list' ? "flex flex-col divide-y divide-slate-100 dark:divide-white/5" : "grid grid-cols-3 gap-3"
            )}>
                {sortedChapters.map((chapter) => (
                    <div
                        key={chapter.id}
                        onClick={() => onChapterSelect(chapter)}
                        className={clsx(
                            viewMode === 'list'
                                ? "py-4 flex items-center justify-between group cursor-pointer active:opacity-70 transition-opacity"
                                : "aspect-square rounded-xl bg-slate-100 dark:bg-[#1d1c27] border border-slate-200 dark:border-white/5 flex flex-col items-center justify-center p-2 cursor-pointer active:scale-95 transition-transform relative overflow-hidden"
                        )}
                    >
                        {viewMode === 'list' ? (
                            <>
                                <div className="flex items-center gap-4">
                                    <div className="h-12 w-12 rounded-lg bg-slate-200 dark:bg-[#1d1c27] border border-slate-200 dark:border-white/5 flex items-center justify-center overflow-hidden shrink-0 text-slate-400 font-bold text-xs">
                                        {chapter.isRead ? <CheckCircle2 size={20} className="text-green-500" /> : <span>#{chapter.orderIndex + 1}</span>}
                                    </div>
                                    <div className="flex flex-col">
                                        <span className={clsx(
                                            "text-sm font-bold",
                                            chapter.isRead ? "text-slate-400 dark:text-slate-500" : "text-slate-900 dark:text-white"
                                        )}>
                                            {chapter.title}
                                        </span>
                                        {chapter.isRead && (
                                            <span className="text-[10px] text-green-600 dark:text-green-500 font-medium">Read</span>
                                        )}
                                    </div>
                                </div>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onDownload(chapter);
                                    }}
                                    className="p-2 -mr-2 text-slate-400 hover:text-primary dark:hover:text-white transition-colors"
                                >
                                    <Download size={20} />
                                </button>
                            </>
                        ) : (
                            <>
                                <span className={clsx(
                                    "text-sm font-bold text-center",
                                    chapter.isRead ? "text-slate-400 dark:text-slate-500" : "text-slate-900 dark:text-white"
                                )}>
                                    {chapter.title.replace(/Chapter\s*/i, '')}
                                </span>
                                {chapter.isRead && (
                                    <div className="absolute top-1 right-1 text-green-500">
                                        <CheckCircle2 size={12} />
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};
