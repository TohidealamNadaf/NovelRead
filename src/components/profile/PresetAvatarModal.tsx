import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check } from 'lucide-react';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { PRESET_AVATARS, type PresetAvatar } from '../../utils/profileImage.util';

interface PresetAvatarModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentAvatar: string;
    onSelectPreset: (presetId: string) => void;
}

export const PresetAvatarModal: React.FC<PresetAvatarModalProps> = ({
    isOpen,
    onClose,
    currentAvatar,
    onSelectPreset,
}) => {
    const triggerHaptic = async () => {
        try {
            await Haptics.impact({ style: ImpactStyle.Light });
        } catch {
            // Safe fallback on web
        }
    };

    const handleSelect = (preset: PresetAvatar) => {
        triggerHaptic();
        onSelectPreset(preset.id);
        onClose();
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="fixed inset-0 bg-black/70 backdrop-blur-xs"
                        onClick={onClose}
                        aria-hidden="true"
                    />

                    {/* Modal Dialog */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.94, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.94, y: 10 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 350 }}
                        className="relative z-10 w-full max-w-md bg-[#18181b] border border-white/10 rounded-2xl p-5 shadow-2xl flex flex-col max-h-[85vh]"
                        role="dialog"
                        aria-modal="true"
                        aria-label="Select Reader Avatar"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between pb-3 border-b border-white/5">
                            <div>
                                <h3 className="text-base font-bold text-white">Choose Preset Avatar</h3>
                                <p className="text-xs text-slate-400">Exclusive reader-themed character styles</p>
                            </div>
                            <button
                                onClick={() => {
                                    triggerHaptic();
                                    onClose();
                                }}
                                className="p-2 text-slate-400 hover:text-white rounded-full hover:bg-white/5 transition-colors"
                                aria-label="Close"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Presets Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 py-4 overflow-y-auto pr-1">
                            {PRESET_AVATARS.map((preset) => {
                                const isSelected = currentAvatar === preset.id || currentAvatar === preset.svgUrl;
                                return (
                                    <button
                                        key={preset.id}
                                        onClick={() => handleSelect(preset)}
                                        className={`relative flex flex-col items-center p-3 rounded-xl border transition-all active:scale-95 group text-center ${
                                            isSelected
                                                ? 'bg-primary/10 border-primary ring-2 ring-primary/30'
                                                : 'bg-white/5 border-white/5 hover:border-white/20 hover:bg-white/10'
                                        }`}
                                    >
                                        <div className="relative size-16 rounded-full overflow-hidden mb-2 shadow-md">
                                            <img
                                                src={preset.svgUrl}
                                                alt={preset.name}
                                                className="size-full object-cover select-none pointer-events-none"
                                                draggable={false}
                                            />
                                            {isSelected && (
                                                <div className="absolute inset-0 bg-primary/40 flex items-center justify-center">
                                                    <Check size={20} className="text-white drop-shadow-md stroke-[3]" />
                                                </div>
                                            )}
                                        </div>
                                        <span className="text-xs font-semibold text-white truncate w-full">
                                            {preset.name}
                                        </span>
                                        <span className="text-[10px] text-slate-400 px-2 py-0.5 mt-1 rounded-full bg-white/5">
                                            {preset.category}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Footer Close */}
                        <div className="pt-2 border-t border-white/5">
                            <button
                                onClick={() => {
                                    triggerHaptic();
                                    onClose();
                                }}
                                className="w-full py-2.5 text-center text-sm font-semibold text-slate-300 bg-white/5 hover:bg-white/10 rounded-xl transition-colors active:scale-[0.99]"
                            >
                                Close
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};
