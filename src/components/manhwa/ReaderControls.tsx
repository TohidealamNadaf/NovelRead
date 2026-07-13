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
            <div className="bg-[#1a1a2e]/95 backdrop-blur-xl border border-white/10 rounded-full shadow-2xl shadow-black/40 p-1.5 flex items-center justify-between gap-1.5 max-w-[340px] mx-auto w-full">

                {/* Previous Chapter Button */}
                <button
                    onClick={onPrev}
                    disabled={!hasPrevChapter}
                    className="flex-1 flex items-center justify-center gap-1 h-12 rounded-full transition-all active:scale-95 disabled:opacity-30 disabled:active:scale-100 bg-white/5 hover:bg-white/10 text-white/80"
                >
                    <ChevronLeft size={20} strokeWidth={2.5} />
                    <span className="text-xs font-bold tracking-wide">Prev</span>
                </button>

                {/* Display Settings */}
                <button
                    onClick={onToggleSettingsMenu}
                    className="w-12 h-12 shrink-0 flex items-center justify-center rounded-full transition-all active:scale-90 text-white/80 hover:text-white bg-white/5 hover:bg-white/10"
                >
                    <SlidersHorizontal size={18} />
                </button>

                {/* Index / Chapter List */}
                <button
                    onClick={onHistory}
                    className="w-12 h-12 shrink-0 flex items-center justify-center rounded-full transition-all active:scale-90 text-white/80 hover:text-white bg-white/5 hover:bg-white/10"
                >
                    <List size={18} />
                </button>

                {/* Next Chapter — primary CTA */}
                <button
                    onClick={onNext}
                    disabled={!hasNextChapter}
                    className="flex-[1.2] flex items-center justify-center gap-1 bg-primary text-white h-12 rounded-full font-bold text-xs shadow-lg shadow-primary/30 active:scale-95 transition-all disabled:opacity-40 disabled:active:scale-100"
                >
                    {hasNextChapter ? (
                        <>
                            <span className="tracking-wide">Next</span>
                            <ChevronRight size={20} strokeWidth={2.5} />
                        </>
                    ) : (
                        <span className="tracking-wide text-[10px]">End</span>
                    )}
                </button>

            </div>
        </motion.nav>
    );
};
