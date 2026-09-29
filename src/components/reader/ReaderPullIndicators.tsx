import { motion } from 'framer-motion';
import clsx from 'clsx';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface ReaderPullDownIndicatorProps {
    pullDistance: number;
    threshold: number;
    hasPrev: boolean;
}

export const ReaderPullDownIndicator = ({
    pullDistance,
    threshold,
    hasPrev,
}: ReaderPullDownIndicatorProps) => {
    return (
        <motion.div
            style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: `-${pullDistance}px`,
                height: pullDistance,
                opacity: Math.min(pullDistance / threshold, 1)
            }}
            className="flex flex-col items-center justify-end pb-4 overflow-hidden pointer-events-none"
        >
            <motion.div
                animate={{ y: pullDistance > threshold ? [0, -4, 0] : 0 }}
                className="flex flex-col items-center gap-1.5"
            >
                <ChevronDown
                    className={clsx(
                        "transition-all duration-300",
                        pullDistance > threshold ? "text-primary scale-125 rotate-180" : "text-gray-400"
                    )}
                />
                <p
                    className={clsx(
                        "text-[10px] font-black uppercase tracking-[0.2em] bg-background-light dark:bg-background-dark px-4 py-1.5 rounded-full border shadow-sm transition-colors",
                        pullDistance > threshold
                            ? "text-primary border-primary/40 shadow-primary/10"
                            : "text-gray-500 border-gray-100 dark:border-gray-800"
                    )}
                >
                    {pullDistance > threshold
                        ? (hasPrev ? "Release" : "At Start")
                        : (hasPrev ? "Pull for Prev" : "First Chapter")}
                </p>
            </motion.div>
        </motion.div>
    );
};

interface ReaderPullUpIndicatorProps {
    pushDistance: number;
    threshold: number;
    hasNext: boolean;
}

export const ReaderPullUpIndicator = ({
    pushDistance,
    threshold,
    hasNext,
}: ReaderPullUpIndicatorProps) => {
    return (
        <motion.div
            style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: `-${pushDistance}px`,
                height: pushDistance,
                opacity: Math.min(pushDistance / threshold, 1)
            }}
            className="flex flex-col items-center justify-start pt-4 overflow-hidden pointer-events-none"
        >
            <motion.div
                animate={{ y: pushDistance > threshold ? [0, 4, 0] : 0 }}
                className="flex flex-col items-center gap-1.5"
            >
                <p
                    className={clsx(
                        "text-[10px] font-black uppercase tracking-[0.2em] bg-background-light dark:bg-background-dark px-4 py-1.5 rounded-full border shadow-sm transition-colors",
                        pushDistance > threshold
                            ? "text-primary border-primary/40 shadow-primary/10"
                            : "text-gray-500 border-gray-100 dark:border-gray-800"
                    )}
                >
                    {pushDistance > threshold
                        ? (hasNext ? "Release" : "At End")
                        : (hasNext ? "Pull for Next" : "End of Story")}
                </p>
                <ChevronUp
                    className={clsx(
                        "transition-all duration-300",
                        pushDistance > threshold ? "text-primary scale-125 rotate-180" : "text-gray-400"
                    )}
                />
            </motion.div>
        </motion.div>
    );
};
