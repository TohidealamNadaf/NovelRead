import React from 'react';
import { ChevronRight, List, MessageSquare, Moon, Sun } from 'lucide-react';
import { motion } from 'framer-motion';

interface ReaderControlsProps {
    onNext: () => void;
    onHistory?: () => void;
    onToggleTheme?: () => void;
    isDarkMode?: boolean;
    show: boolean;
    hasNextChapter?: boolean;
}

export const ReaderControls: React.FC<ReaderControlsProps> = ({
    onNext,
    onHistory,
    onToggleTheme,
    isDarkMode,
    show,
    hasNextChapter = true
}) => {
    return (
        <motion.nav
            initial={{ y: 100 }}
            animate={{ y: show ? 0 : 100 }}
            transition={{ duration: 0.3 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40 w-[90%] max-w-md"
        >
            <div className="bg-white/80 dark:bg-black/80 backdrop-blur-xl border border-white/20 dark:border-white/10 rounded-2xl shadow-2xl p-2 flex items-center justify-between">
                <div className="flex items-center">
                    <button
                        onClick={onToggleTheme}
                        className="flex flex-col items-center justify-center w-14 h-12 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white active:bg-black/5 dark:active:bg-white/5 transition-colors"
                    >
                        {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
                        <span className="text-[9px] mt-1">{isDarkMode ? 'Light' : 'Dark'}</span>
                    </button>
                    {/* Placeholder for comments/chat if needed */}
                    <button className="flex flex-col items-center justify-center w-14 h-12 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white active:bg-black/5 dark:active:bg-white/5 transition-colors opacity-50 cursor-not-allowed">
                        <MessageSquare size={20} />
                        <span className="text-[9px] mt-1">Chat</span>
                    </button>
                </div>

                <div className="h-8 w-[1px] bg-slate-200 dark:bg-white/10 mx-1"></div>

                <button
                    onClick={onNext}
                    disabled={!hasNextChapter}
                    className="flex-1 mx-2 flex items-center justify-center gap-2 bg-primary text-white h-12 rounded-xl font-bold text-sm shadow-lg shadow-primary/20 active:scale-95 transition-transform disabled:opacity-50 disabled:active:scale-100"
                >
                    {hasNextChapter ? 'Next Chapter' : 'Finished'}
                    {hasNextChapter && <ChevronRight size={18} />}
                </button>

                <div className="h-8 w-[1px] bg-slate-200 dark:bg-white/10 mx-1"></div>

                <button
                    onClick={onHistory}
                    className="flex flex-col items-center justify-center w-14 h-12 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white active:bg-black/5 dark:active:bg-white/5 transition-colors"
                >
                    <List size={20} />
                    <span className="text-[9px] mt-1">Index</span>
                </button>
            </div>
        </motion.nav>
    );
};
