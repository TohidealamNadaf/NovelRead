import { Flame, Clock, BookOpen, Library } from 'lucide-react';
import type { ReadingStatistics } from '../../services/db.service';
import clsx from 'clsx';

interface ReadingStatsCardProps {
    stats: ReadingStatistics;
    loading?: boolean;
}

export const ReadingStatsCard = ({ stats, loading }: ReadingStatsCardProps) => {
    // Format minutes into "Xh Ym"
    const formatTime = (totalMinutes: number) => {
        if (!totalMinutes || totalMinutes <= 0) return '0m';
        const hours = Math.floor(totalMinutes / 60);
        const mins = totalMinutes % 60;
        if (hours === 0) return `${mins}m`;
        if (mins === 0) return `${hours}h`;
        return `${hours}h ${mins}m`;
    };

    // Find highest reading day for relative bar heights
    const maxMinutes = Math.max(1, ...(stats.last7Days?.map(d => d.minutes) || [1]));

    return (
        <div className="space-y-4 px-4 pb-6">
            {/* 4-Stat Grid */}
            <div className="grid grid-cols-2 gap-3">
                {/* Streak */}
                <div className="flex items-center gap-3.5 p-4 rounded-2xl bg-[#121118] border border-white/5 shadow-sm">
                    <div className="size-11 rounded-xl bg-orange-500/10 text-orange-500 flex items-center justify-center shrink-0">
                        <Flame size={24} className={stats.currentStreakDays > 0 ? "fill-orange-500" : ""} />
                    </div>
                    <div>
                        <p className="text-xl font-extrabold text-white">
                            {loading ? '-' : `${stats.currentStreakDays}d`}
                        </p>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                            Reading Streak
                        </p>
                    </div>
                </div>

                {/* Total Time */}
                <div className="flex items-center gap-3.5 p-4 rounded-2xl bg-[#121118] border border-white/5 shadow-sm">
                    <div className="size-11 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0">
                        <Clock size={22} />
                    </div>
                    <div>
                        <p className="text-xl font-extrabold text-white">
                            {loading ? '-' : formatTime(stats.totalReadingTimeMinutes)}
                        </p>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                            Total Time
                        </p>
                    </div>
                </div>

                {/* Chapters Read */}
                <div className="flex items-center gap-3.5 p-4 rounded-2xl bg-[#121118] border border-white/5 shadow-sm">
                    <div className="size-11 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
                        <BookOpen size={22} />
                    </div>
                    <div>
                        <p className="text-xl font-extrabold text-white">
                            {loading ? '-' : stats.chaptersRead}
                        </p>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                            Chapters Read
                        </p>
                    </div>
                </div>

                {/* Library Count */}
                <div className="flex items-center gap-3.5 p-4 rounded-2xl bg-[#121118] border border-white/5 shadow-sm">
                    <div className="size-11 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center shrink-0">
                        <Library size={22} />
                    </div>
                    <div>
                        <p className="text-xl font-extrabold text-white">
                            {loading ? '-' : stats.novelsCount}
                        </p>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                            Novels Added
                        </p>
                    </div>
                </div>
            </div>

            {/* Weekly Activity Bar Chart */}
            <div className="p-4 rounded-2xl bg-[#121118] border border-white/5 space-y-3">
                <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        Weekly Activity
                    </span>
                    <span className="text-xs font-semibold text-primary">
                        Last 7 Days
                    </span>
                </div>

                <div className="flex items-end justify-between gap-2 h-24 pt-2">
                    {stats.last7Days?.map((day, idx) => {
                        const heightPercent = day.minutes > 0
                            ? Math.max(15, Math.round((day.minutes / maxMinutes) * 100))
                            : 6;
                        const isToday = idx === stats.last7Days.length - 1;

                        return (
                            <div key={day.date} className="flex-1 flex flex-col items-center gap-2 h-full justify-end group">
                                <div className="w-full relative flex items-end justify-center h-full">
                                    <div
                                        style={{ height: `${heightPercent}%` }}
                                        className={clsx(
                                            "w-full max-w-[28px] rounded-lg transition-all duration-300",
                                            day.minutes > 0
                                                ? isToday
                                                    ? "bg-primary shadow-sm shadow-primary/30"
                                                    : "bg-primary/60 hover:bg-primary/80"
                                                : "bg-white/5"
                                        )}
                                    />
                                    {day.minutes > 0 && (
                                        <div className="absolute -top-7 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none text-[10px] font-bold bg-black/80 px-1.5 py-0.5 rounded text-white whitespace-nowrap">
                                            {day.minutes}m
                                        </div>
                                    )}
                                </div>
                                <span className={clsx(
                                    "text-[10px] font-bold uppercase tracking-tight",
                                    isToday ? "text-primary" : "text-slate-500"
                                )}>
                                    {day.dayName}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
