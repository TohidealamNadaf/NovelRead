import { motion, AnimatePresence } from 'framer-motion';
import { X, FileText, List, Sparkles } from 'lucide-react';
import { useState } from 'react';
import clsx from 'clsx';

interface SummaryModalProps {
    isOpen: boolean;
    onClose: () => void;
    summary: { extractive: string; events: string[] } | null;
    isLoading: boolean;
}

export const SummaryModal = ({ isOpen, onClose, summary, isLoading }: SummaryModalProps) => {
    const [activeTab, setActiveTab] = useState<'overview' | 'events'>('overview');

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4">
            <div
                className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            />

            <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="w-full max-w-lg bg-white dark:bg-[#1a182b] rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[85vh] z-50 overflow-hidden"
            >
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-white/5">
                    <div className="flex items-center gap-2 text-primary">
                        <Sparkles size={18} />
                        <h3 className="font-bold text-lg">Quick Chapter Overview</h3>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
                    >
                        <X size={20} className="text-gray-500" />
                    </button>
                </div>

                {/* Info Banner */}
                <div className="bg-primary/5 px-4 py-2 border-b border-primary/10">
                    <p className="text-[10px] text-primary/80 font-medium text-center uppercase tracking-wide">
                        Auto-selected excerpts • Generated locally
                    </p>
                </div>

                {/* Tabs */}
                <div className="flex p-2 gap-2 bg-gray-50 dark:bg-black/20">
                    <button
                        onClick={() => setActiveTab('overview')}
                        className={clsx(
                            "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all",
                            activeTab === 'overview'
                                ? "bg-white dark:bg-gray-700 text-primary dark:text-white shadow-sm"
                                : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                        )}
                    >
                        <FileText size={16} />
                        Overview
                    </button>
                    <button
                        onClick={() => setActiveTab('events')}
                        className={clsx(
                            "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all",
                            activeTab === 'events'
                                ? "bg-white dark:bg-gray-700 text-primary dark:text-white shadow-sm"
                                : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                        )}
                    >
                        <List size={16} />
                        Key Events
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-5 min-h-[300px]">
                    {isLoading ? (
                        <div className="h-full flex flex-col items-center justify-center gap-4 text-gray-400">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                            <p className="text-sm font-medium animate-pulse">Analyzing chapter content...</p>
                        </div>
                    ) : summary ? (
                        <AnimatePresence mode="wait">
                            {activeTab === 'overview' ? (
                                <motion.div
                                    key="overview"
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 10 }}
                                    className="prose prose-sm dark:prose-invert prose-p:leading-relaxed"
                                >
                                    <p className="text-gray-700 dark:text-gray-300 first-letter:text-2xl first-letter:font-bold first-letter:text-primary first-letter:float-left first-letter:mr-1">
                                        {summary.extractive}
                                    </p>
                                </motion.div>
                            ) : (
                                <motion.div
                                    key="events"
                                    initial={{ opacity: 0, x: 10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -10 }}
                                    className="space-y-3"
                                >
                                    {summary.events.map((event, i) => (
                                        <div key={i} className="flex gap-3 items-start p-3 rounded-lg bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/5">
                                            <div className="mt-1 min-w-[6px] h-[6px] rounded-full bg-primary shrink-0" />
                                            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                                                {event}
                                            </p>
                                        </div>
                                    ))}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-gray-400">
                            <p>No summary available.</p>
                        </div>
                    )}
                </div>
            </motion.div>
        </div>
    );
};
