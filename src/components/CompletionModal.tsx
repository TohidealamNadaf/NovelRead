import React from 'react';
import { CheckCircle2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface CompletionModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    message: string;
}

export const CompletionModal: React.FC<CompletionModalProps> = ({ isOpen, onClose, title, message }) => {
    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                    />

                    {/* Modal Content */}
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.9, opacity: 0, y: 20 }}
                        className="relative w-full max-w-sm bg-white dark:bg-[#1c1b2e] rounded-3xl p-8 shadow-2xl border border-white/10 text-center"
                    >
                        <button
                            onClick={onClose}
                            className="absolute top-4 right-4 p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                        >
                            <X size={20} className="text-slate-400" />
                        </button>

                        <div className="flex justify-center mb-6">
                            <div className="size-20 bg-emerald-500/10 rounded-full flex items-center justify-center">
                                <CheckCircle2 className="text-emerald-500" size={48} />
                            </div>
                        </div>

                        <h3 className="text-2xl font-bold mb-2 dark:text-white">{title}</h3>
                        <p className="text-slate-500 dark:text-slate-400 mb-8 leading-relaxed">
                            {message}
                        </p>

                        <button
                            onClick={onClose}
                            className="w-full py-4 bg-primary text-white rounded-2xl font-bold shadow-lg shadow-primary/30 active:scale-95 transition-transform"
                        >
                            AWESOME
                        </button>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};
