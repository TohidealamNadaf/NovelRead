import React, { memo } from 'react';
import { DownloadCloud, CheckCircle, Loader2 } from 'lucide-react';
import type { Chapter } from '../services/db.service';

interface ChapterRowProps {
    chapter: Chapter | { title: string; url: string; _index: number; date?: string };
    index: number; // visual index (1-based or 0-based depending on usage)
    isLiveMode: boolean;
    isDownloaded: boolean;
    isDownloading: boolean;
    isRead: boolean;
    onClick: () => void;
    onDownload?: (e: React.MouseEvent) => void;
    style?: React.CSSProperties;
}

export const ChapterRow = memo(({
    chapter,
    index,
    isLiveMode,
    isDownloaded,
    isDownloading,
    isRead,
    onClick,
    onDownload,
    style
}: ChapterRowProps) => { // Accept style prop for virtualization
    return (
        <div
            style={style}
            className="flex items-center gap-4 p-4 hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors cursor-pointer border-b border-slate-100 dark:border-slate-800"
            onClick={onClick}
        >
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-0.5">
                    <span className="text-slate-400 font-sans text-xs font-bold w-8 text-right shrink-0">
                        {index}
                    </span>
                    <div className="flex flex-col min-w-0">
                        <h3 className={`text-sm font-bold truncate dark:text-slate-100 ${isRead ? 'opacity-60 font-normal' : ''}`}>
                            {chapter.title}
                        </h3>
                        {/* Show date if available (mainly for Live chapters) */}
                        {'date' in chapter && chapter.date && (
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                                {chapter.date}
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {isLiveMode ? (
                <button
                    className="flex gap-3 p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    onClick={onDownload}
                >
                    {isDownloading ? (
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
                    ) : isDownloaded ? (
                        <CheckCircle className="text-green-500" size={20} />
                    ) : (
                        <DownloadCloud className="text-slate-300 dark:text-slate-700" size={20} />
                    )}
                </button>
            ) : (
                isDownloaded || (chapter as Chapter).content ? (
                    <CheckCircle className="text-green-500" size={20} />
                ) : (
                    <button
                        className="flex gap-3 p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        onClick={onDownload}
                    >
                        {isDownloading ? (
                            <Loader2 className="animate-spin text-primary" size={20} />
                        ) : (
                            <DownloadCloud className="text-slate-300 dark:text-slate-700" size={20} />
                        )}
                    </button>
                )
            )}
        </div>
    );
});
