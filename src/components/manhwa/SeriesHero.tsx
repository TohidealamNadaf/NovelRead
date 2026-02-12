import React from 'react';
import { Star, Eye, Book, Play, Bookmark } from 'lucide-react';
import type { Novel } from '../../services/db.service';

interface SeriesHeroProps {
    novel: Novel;
    onReadNow: () => void;
    onToggleLibrary?: () => void;
    inLibrary?: boolean;
    chapterCount?: number;
}

export const SeriesHero: React.FC<SeriesHeroProps> = ({
    novel,
    onReadNow,
    onToggleLibrary,
    inLibrary,
    chapterCount = 0
}) => {
    // Defensive deduplication for status (e.g. "ONGOINGONGOING")
    const displayStatus = React.useMemo(() => {
        if (!novel.status || novel.status.length < 3) return novel.status;
        const s = novel.status.trim();
        // Check for simple exact repetitions
        for (let i = 1; i <= Math.floor(s.length / 2); i++) {
            if (s.length % i === 0) {
                const sub = s.substring(0, i);
                if (sub.repeat(s.length / i) === s) return sub;
            }
        }
        return s;
    }, [novel.status]);

    // Defensive title cleaning
    const displayTitle = React.useMemo(() => {
        const t = novel.title;
        const upper = t.toUpperCase();
        if (upper === 'UNKNOWN TITLE' || upper.includes('BETA SITE') || upper.includes('READ ON OUR')) {
            return 'Refreshing Title...';
        }
        return t;
    }, [novel.title]);

    return (
        <div className="relative w-full">
            {/* Cover Image & Gradient Overlay */}
            <div className="relative w-full h-[460px] overflow-hidden">
                <img
                    src={novel.coverUrl || 'https://via.placeholder.com/400x600?text=No+Cover'}
                    alt={novel.title}
                    className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background-light dark:from-background-dark via-background-light/20 dark:via-background-dark/20 to-transparent shadow-[inset_0_-120px_80px_-20px_rgba(0,0,0,0.5)] dark:shadow-[inset_0_-120px_80px_-20px_rgba(19,16,34,1)]"></div>

                {/* Content Overlay */}
                <div className="absolute bottom-0 left-0 right-0 p-6 flex flex-col gap-4">
                    <div className="flex flex-wrap gap-2">
                        {displayStatus && (
                            <span className="px-2.5 py-1 rounded-md bg-primary text-white text-[10px] font-bold tracking-wider uppercase">
                                {displayStatus}
                            </span>
                        )}
                        {novel.category && (
                            <span className="px-2.5 py-1 rounded-md bg-white/30 backdrop-blur-md text-white text-[10px] font-bold tracking-wider uppercase border border-white/20">
                                {novel.category}
                            </span>
                        )}
                    </div>

                    <h1 className="text-3xl font-black text-white leading-tight drop-shadow-lg">
                        {displayTitle}
                    </h1>

                    <div className="flex items-center gap-4 text-sm text-slate-700 dark:text-slate-300">
                        <div className="flex items-center gap-1">
                            <Star size={18} className="text-yellow-500 fill-yellow-500" />
                            <span className="font-bold">N/A</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <Eye size={18} />
                            <span>N/A</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <Book size={18} />
                            <span>{chapterCount} Chs</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Action Buttons */}
            <div className="px-6 -mt-4 relative z-10 grid grid-cols-2 gap-3">
                <button
                    onClick={onReadNow}
                    className="flex items-center justify-center gap-2 bg-primary h-12 rounded-xl text-white font-bold shadow-lg shadow-primary/25 active:scale-95 transition-transform"
                >
                    <Play size={20} className="fill-white" />
                    Read Now
                </button>
                <button
                    onClick={onToggleLibrary}
                    className="flex items-center justify-center gap-2 bg-white dark:bg-[#1d1c27] border border-slate-200 dark:border-white/10 h-12 rounded-xl text-slate-900 dark:text-white font-bold active:scale-95 transition-transform"
                >
                    <Bookmark size={20} className={inLibrary ? "fill-primary text-primary" : ""} />
                    {inLibrary ? "Saved" : "Library"}
                </button>
            </div>

            {/* Summary Section */}
            <div className="px-6 mt-8">
                <h2 className="text-lg font-bold mb-3 text-slate-900 dark:text-white">Summary</h2>
                <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed line-clamp-4">
                    {novel.summary || "No summary available."}
                </p>
            </div>
        </div>
    );
};
