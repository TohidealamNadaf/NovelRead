import React from 'react';
import { ChevronLeft, ChevronRight, List, LayoutPanelTop } from 'lucide-react';
import { motion } from 'framer-motion';

interface ReaderControlsProps {
    onNext: () => void;
    onPrev?: () => void;
    onHistory?: () => void;
    onTogglePositionMenu?: () => void;
    show: boolean;
    hasNextChapter?: boolean;
    hasPrevChapter?: boolean;
}

export const ReaderControls: React.FC<ReaderControlsProps> = ({
    onNext,
    onPrev,
    onHistory,
    onTogglePositionMenu,
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
            <div className="bg-[#1a1a2e]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl shadow-black/40 px-3 py-2.5 flex items-center gap-2">

                {/* Previous Chapter Button */}
                <button
                    onClick={onPrev}
                    disabled={!hasPrevChapter}
                    className="flex flex-col items-center justify-center w-14 h-12 rounded-xl transition-all active:scale-90 disabled:opacity-30 disabled:active:scale-100 text-white/70 hover:text-white hover:bg-white/10"
                >
                    <ChevronLeft size={22} />
                    <span className="text-[9px] mt-0.5 font-semibold">Prev</span>
                </button>

                {/* Next Chapter — primary CTA, takes remaining space */}
                <button
                    onClick={onNext}
                    disabled={!hasNextChapter}
                    className="flex-1 flex items-center justify-center gap-2 bg-primary text-white h-12 rounded-xl font-bold text-sm shadow-lg shadow-primary/30 active:scale-95 transition-all disabled:opacity-40 disabled:active:scale-100"
                >
                    {hasNextChapter ? (
                        <>
                            Next Chapter
                            <ChevronRight size={18} strokeWidth={2.5} />
                        </>
                    ) : (
                        'All Caught Up'
                    )}
                </button>

                {/* Adjust Progress Bar */}
                <button
                    onClick={onTogglePositionMenu}
                    className="flex flex-col items-center justify-center w-14 h-12 rounded-xl transition-all active:scale-90 text-white/70 hover:text-white hover:bg-white/10"
                >
                    <LayoutPanelTop size={20} />
                    <span className="text-[9px] mt-0.5 font-semibold">Bar</span>
                </button>

                {/* Index / Chapter List */}
                <button
                    onClick={onHistory}
                    className="flex flex-col items-center justify-center w-14 h-12 rounded-xl transition-all active:scale-90 text-white/70 hover:text-white hover:bg-white/10"
                >
                    <List size={20} />
                    <span className="text-[9px] mt-0.5 font-semibold">Index</span>
                </button>

            </div>
        </motion.nav>
    );
};
