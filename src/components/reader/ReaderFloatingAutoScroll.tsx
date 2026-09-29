import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { ChevronsDown, Minus, Plus, Pause } from 'lucide-react';

interface ReaderFloatingAutoScrollProps {
    isVisible: boolean;
    autoScrollSpeed: number;
    onDecreaseSpeed: () => void;
    onIncreaseSpeed: () => void;
    onStopAutoScroll: () => void;
}

export const ReaderFloatingAutoScroll = ({
    isVisible,
    autoScrollSpeed,
    onDecreaseSpeed,
    onIncreaseSpeed,
    onStopAutoScroll,
}: ReaderFloatingAutoScrollProps) => {
    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 20 }}
                    className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 bg-white/90 dark:bg-[#1a182b]/90 backdrop-blur-xl rounded-full shadow-2xl border border-slate-200 dark:border-white/10 px-3 py-2"
                >
                    <ChevronsDown size={16} className="text-primary animate-bounce shrink-0" />
                    <button
                        onClick={onDecreaseSpeed}
                        disabled={autoScrollSpeed <= 1}
                        className={clsx(
                            "size-7 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 transition-all active:scale-90",
                            autoScrollSpeed <= 1 && "opacity-30"
                        )}
                    >
                        <Minus size={12} />
                    </button>
                    <span className="text-sm font-bold text-primary min-w-[28px] text-center">
                        {autoScrollSpeed}x
                    </span>
                    <button
                        onClick={onIncreaseSpeed}
                        disabled={autoScrollSpeed >= 10}
                        className={clsx(
                            "size-7 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 transition-all active:scale-90",
                            autoScrollSpeed >= 10 && "opacity-30"
                        )}
                    >
                        <Plus size={12} />
                    </button>
                    <button
                        onClick={onStopAutoScroll}
                        className="size-7 flex items-center justify-center rounded-full bg-red-500/10 text-red-500 transition-all active:scale-90"
                    >
                        <Pause size={12} className="fill-red-500" />
                    </button>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
