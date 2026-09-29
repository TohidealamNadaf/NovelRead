import { ChevronDown } from 'lucide-react';
import type { Chapter } from '../../services/db.service';

interface ReaderNavigationHintsProps {
    nextChapter: Chapter | null;
    onNextChapter: () => void;
}

export const ReaderNavigationHints = ({
    nextChapter,
    onNextChapter,
}: ReaderNavigationHintsProps) => {
    if (nextChapter) {
        return (
            <div
                className="mt-12 mb-8 flex flex-col items-center gap-3 pt-8 border-t border-dashed border-slate-300 dark:border-slate-700 cursor-pointer active:opacity-70 transition-opacity"
                onClick={(e) => {
                    e.stopPropagation();
                    onNextChapter();
                }}
            >
                <p className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-widest font-semibold">
                    Tap or swipe up for next chapter
                </p>
                <div className="flex flex-col items-center animate-bounce">
                    <ChevronDown size={24} className="text-primary" />
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400 text-center max-w-xs line-clamp-1 font-medium">
                    {nextChapter.title}
                </p>
            </div>
        );
    }

    return (
        <div className="mt-12 mb-8 flex flex-col items-center gap-3 pt-8 border-t border-dashed border-slate-300 dark:border-slate-700">
            <p className="text-sm text-slate-500 dark:text-slate-400 font-semibold">🎉 You've reached the end!</p>
            <p className="text-xs text-slate-400 dark:text-slate-500">No more chapters available</p>
        </div>
    );
};
