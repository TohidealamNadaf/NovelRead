import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import { X, FileText, List, Sparkles } from 'lucide-react';
import { useState, useEffect } from 'react';
import clsx from 'clsx';

interface SummaryModalProps {
    isOpen: boolean;
    onClose: () => void;
    summary: {
        extractive: string;
        events: string[];
        structuredOverview?: { header: string; intro: string; bullets: string[] }[];
    } | null;
    isLoading: boolean;
    onReload?: () => void;
}

export const SummaryModal = ({ isOpen, onClose, summary, isLoading, onReload }: SummaryModalProps) => {
    const [activeTab, setActiveTab] = useState<'overview' | 'events'>('overview');

    // Height tracking values
    const getVh = () => typeof window !== 'undefined' ? window.innerHeight : 800;
    const MIN_HEIGHT = 400;

    // Set dynamic base min tracking depending on screen height
    const heightRaw = useMotionValue(Math.max(MIN_HEIGHT, getVh() * 0.4));

    // Clamp the pixel height to visually bounded percentage values
    const height = useTransform(heightRaw, (h) => {
        const vh = getVh();
        const bounded = Math.min(Math.max(h, vh * 0.4), vh * 0.95);
        return `${bounded}px`;
    });

    // Reset tracking when opened
    useEffect(() => {
        if (isOpen) {
            heightRaw.set(Math.max(MIN_HEIGHT, getVh() * 0.4));
        }
    }, [isOpen, heightRaw]);

    if (!isOpen) return null;

    // Helper to safely split newlines regardless of OS
    const summaryParagraphs = summary?.extractive?.split(/\n+/).filter(p => p.trim().length > 0) || [];

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4 pointer-events-none">
            <div
                className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity pointer-events-auto"
                onClick={onClose}
            />

            <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                style={{ height }}
                className="w-full max-w-lg bg-white dark:bg-[#1a182b] rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col z-50 overflow-hidden pointer-events-auto"
            >
                {/* Drag Handle */}
                <motion.div
                    className="w-full flex justify-center pt-1 pb-0 cursor-grab active:cursor-grabbing touch-none"
                    onPan={(_e, info) => {
                        const vh = window.innerHeight;
                        const maxH = vh * 0.95;
                        const minH = Math.max(400, vh * 0.4);

                        // info.delta.y is negative when dragging up.
                        // So subtracting it INCREASES the height.
                        let newHeight = heightRaw.get() - info.delta.y;

                        // Clamp the internal value so it doesn't run away outside visual bounds
                        newHeight = Math.min(Math.max(newHeight, minH - 20), maxH + 20);

                        heightRaw.set(newHeight);
                    }}
                    onPanEnd={(_e, info) => {
                        const minH = Math.max(400, window.innerHeight * 0.4);

                        // Close if thrown down fast or pushed below minimum size
                        if (info.velocity.y > 600 || heightRaw.get() < minH - 10) {
                            onClose();
                        }
                    }}
                >
                    <div className="w-8 h-1 bg-gray-300 dark:bg-white/20 rounded-full" />
                </motion.div>

                {/* Header */}
                <div className="flex items-center justify-between pt-1 px-4 pb-4 border-b border-gray-100 dark:border-white/5">
                    <div className="flex items-center gap-2 text-primary">
                        <Sparkles size={18} />
                        <h3 className="font-bold text-lg">Quick Chapter Overview</h3>
                    </div>
                    <div className="flex items-center gap-1">
                        {onReload && (
                            <button
                                onClick={onReload}
                                disabled={isLoading}
                                className={clsx(
                                    "p-2 rounded-full transition-colors",
                                    isLoading ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-100 dark:hover:bg-white/5"
                                )}
                                title="Regenerate Summary"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={clsx("text-gray-500", isLoading && "animate-spin")}>
                                    <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                                    <path d="M21 3v5h-5" />
                                </svg>
                            </button>
                        )}
                        <button
                            onClick={onClose}
                            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
                        >
                            <X size={20} className="text-gray-500" />
                        </button>
                    </div>
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
                                    {summary.structuredOverview && summary.structuredOverview.length > 0 ? (
                                        <div className="space-y-6">
                                            {summary.structuredOverview.map((section, idx) => (
                                                <div key={idx} className="space-y-3">
                                                    <h4 className="text-lg font-bold text-gray-900 dark:text-white border-b border-gray-200 dark:border-white/10 pb-1">{section.header}</h4>
                                                    <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">{section.intro}</p>
                                                    {section.bullets && section.bullets.length > 0 && (
                                                        <ul className="space-y-2 mt-2">
                                                            {section.bullets.map((bullet, bIdx) => {
                                                                const parts = bullet.split(':');
                                                                if (parts.length > 1 && parts[0].length < 50) {
                                                                    const title = parts.shift();
                                                                    const desc = parts.join(':');
                                                                    return (
                                                                        <li key={bIdx} className="flex gap-3 items-start text-sm text-gray-700 dark:text-gray-300 leading-relaxed ml-2">
                                                                            <div className="mt-1.5 min-w-[5px] h-[5px] rounded-full bg-primary/60 shrink-0" />
                                                                            <div><span className="font-semibold text-gray-900 dark:text-gray-100">{title}:</span>{desc}</div>
                                                                        </li>
                                                                    );
                                                                }
                                                                return (
                                                                    <li key={bIdx} className="flex gap-3 items-start text-sm text-gray-700 dark:text-gray-300 leading-relaxed ml-2">
                                                                        <div className="mt-1.5 min-w-[5px] h-[5px] rounded-full bg-primary/60 shrink-0" />
                                                                        <div>{bullet}</div>
                                                                    </li>
                                                                );
                                                            })}
                                                        </ul>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        summaryParagraphs.map((paragraph, idx) => (
                                            <p
                                                key={idx}
                                                className={clsx(
                                                    "text-gray-700 dark:text-gray-300 mb-4",
                                                    idx === 0 && "first-letter:text-2xl first-letter:font-bold first-letter:text-primary first-letter:float-left first-letter:mr-1"
                                                )}
                                            >
                                                {paragraph.trim()}
                                            </p>
                                        ))
                                    )}
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
        </div >
    );
};
