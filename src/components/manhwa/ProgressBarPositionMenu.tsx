import React from 'react';
import { PanelLeft, PanelBottom, PanelRight, PanelTop, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type Position = 'top' | 'bottom' | 'left' | 'right' | 'off';

interface ProgressBarPositionMenuProps {
    position: Position;
    onSelect: (pos: Position) => void;
    isOpen: boolean;
}

export const ProgressBarPositionMenu: React.FC<ProgressBarPositionMenuProps> = ({ position, onSelect, isOpen }) => {
    const buttons: { id: Position; Icon: React.ElementType }[] = [
        { id: 'left', Icon: PanelLeft },
        { id: 'bottom', Icon: PanelBottom },
        { id: 'right', Icon: PanelRight },
        { id: 'top', Icon: PanelTop },
        { id: 'off', Icon: X },
    ];

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 20, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-sm"
                >
                    <div className="bg-[#1a1a2e]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl p-3 flex flex-col items-center gap-2">
                        <span className="text-[10px] font-bold text-white/40 tracking-widest uppercase">Progress Bar</span>
                        <div className="flex items-center justify-center gap-2 w-full">
                            {buttons.map(({ id, Icon }) => {
                                const isActive = position === id;
                                return (
                                    <button
                                        key={id}
                                        onClick={() => onSelect(id)}
                                        className={`w-10 h-10 flex items-center justify-center rounded-full transition-colors ${isActive ? 'bg-primary text-white' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}
                                    >
                                        <Icon size={18} />
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
