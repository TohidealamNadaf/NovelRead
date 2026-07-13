import React from 'react';
import { ChevronLeft, ChevronRight, List, SlidersHorizontal } from 'lucide-react';
import { motion } from 'framer-motion';

interface ReaderControlsProps {
    onNext: () => void;
    onPrev?: () => void;
    onHistory?: () => void;
    onToggleSettingsMenu?: () => void;
    show: boolean;
    hasNextChapter?: boolean;
    hasPrevChapter?: boolean;
}

export const ReaderControls: React.FC<ReaderControlsProps> = ({
    onNext,
    onPrev,
    onHistory,
    onToggleSettingsMenu,
    show,
    hasNextChapter = true,
    hasPrevChapter = false,
}) => {
    return (
        <motion.nav
            initial={{ y: 100 }}
            animate={{ y: show ? 0 : 100 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-[92%] max-w-sm"
        >
            <div className="bg-[#1a1a2e]/95 backdrop-blur-xl border border-white/10 rounded-full shadow-2xl shadow-black/50 p-1.5 flex items-center justify-between gap-1.5 max-w-[340px] mx-auto w-full">

                {/* Previous Chapter Button */}
                <button
                    onClick={onPrev}
                    disabled={!hasPrevChapter}
                    className="flex-[1.2] flex items-center justify-center gap-1 h-12 rounded-full bg-white/5 hover:bg-white/10 active:scale-95 transition-all disabled:opacity-30 disabled:active:scale-100 text-white/80"
                >
                    <ChevronLeft size={20} strokeWidth={2.5} />
                    <span className="text-xs font-bold tracking-wide">Prev</span>
                </button>

                {/* Index / Chapter List */}
                <button
                    onClick={onHistory}
                    className="w-12 h-12 shrink-0 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 active:scale-90 transition-all text-white/80 hover:text-white"
                >
                    <List size={20} />
                </button>

                {/* Display Settings */}
                <button
                    onClick={onToggleSettingsMenu}
                    className="w-12 h-12 shrink-0 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 active:scale-90 transition-all text-white/80 hover:text-white"
                >
                    <SlidersHorizontal size={20} />
                </button>

                {/* Next Chapter — primary CTA */}
                <button
                    onClick={onNext}
                    disabled={!hasNextChapter}
                    className="flex-[1.2] flex items-center justify-center gap-1 h-12 rounded-full bg-primary hover:bg-primary/90 shadow-lg shadow-primary/30 active:scale-95 transition-all disabled:opacity-40 disabled:active:scale-100 text-white"
                >
                    <span className="text-xs font-bold tracking-wide">Next</span>
                    <ChevronRight size={20} strokeWidth={2.5} />
                </button>

            </div>
        </motion.nav>
    );
};
