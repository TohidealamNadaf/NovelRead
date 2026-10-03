import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, Image as ImageIcon, Sparkles, Trash2, X } from 'lucide-react';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

interface AvatarPickerSheetProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectCamera: () => void;
    onSelectGallery: () => void;
    onOpenPresets: () => void;
    onRemovePhoto?: () => void;
    hasCustomAvatar: boolean;
}

export const AvatarPickerSheet: React.FC<AvatarPickerSheetProps> = ({
    isOpen,
    onClose,
    onSelectCamera,
    onSelectGallery,
    onOpenPresets,
    onRemovePhoto,
    hasCustomAvatar,
}) => {
    const triggerHaptic = async () => {
        try {
            await Haptics.impact({ style: ImpactStyle.Light });
        } catch {
            // Haptics not available on web, safely ignore
        }
    };

    const handleAction = (action: () => void) => {
        triggerHaptic();
        onClose();
        action();
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex flex-col justify-end">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-xs"
                        onClick={onClose}
                        aria-hidden="true"
                    />

                    {/* Sheet Content */}
                    <motion.div
                        initial={{ y: '100%' }}
                        animate={{ y: 0 }}
                        exit={{ y: '100%' }}
                        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                        className="relative z-10 w-full max-w-lg mx-auto bg-[#18181b] border-t border-white/10 rounded-t-3xl px-5 pt-3 pb-8 shadow-2xl flex flex-col"
                        role="dialog"
                        aria-modal="true"
                        aria-label="Choose profile photo option"
                    >
                        {/* Drag Handle */}
                        <div className="w-12 h-1.5 bg-slate-600/60 rounded-full mx-auto mb-4" />

                        {/* Header */}
                        <div className="flex items-center justify-between pb-3 mb-2 border-b border-white/5">
                            <div>
                                <h3 className="text-base font-semibold text-white tracking-wide">Profile Photo</h3>
                                <p className="text-xs text-slate-400">Choose how to update your avatar</p>
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

                        {/* Action Buttons List */}
                        <div className="flex flex-col gap-2 py-2">
                            {/* Take Photo */}
                            <button
                                onClick={() => handleAction(onSelectCamera)}
                                className="flex items-center gap-3.5 w-full p-3.5 rounded-xl bg-white/5 hover:bg-white/10 active:scale-[0.98] transition-all text-left group"
                            >
                                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/20 text-primary group-hover:bg-primary group-hover:text-white transition-colors">
                                    <Camera size={22} />
                                </div>
                                <div>
                                    <span className="font-semibold text-sm text-white block">Take Photo</span>
                                    <span className="text-xs text-slate-400">Use your camera for a new picture</span>
                                </div>
                            </button>

                            {/* Gallery */}
                            <button
                                onClick={() => handleAction(onSelectGallery)}
                                className="flex items-center gap-3.5 w-full p-3.5 rounded-xl bg-white/5 hover:bg-white/10 active:scale-[0.98] transition-all text-left group"
                            >
                                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                                    <ImageIcon size={22} />
                                </div>
                                <div>
                                    <span className="font-semibold text-sm text-white block">Choose from Gallery</span>
                                    <span className="text-xs text-slate-400">Select an existing photo or illustration</span>
                                </div>
                            </button>

                            {/* Preset Avatar */}
                            <button
                                onClick={() => handleAction(onOpenPresets)}
                                className="flex items-center gap-3.5 w-full p-3.5 rounded-xl bg-white/5 hover:bg-white/10 active:scale-[0.98] transition-all text-left group"
                            >
                                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400 group-hover:bg-amber-500 group-hover:text-white transition-colors">
                                    <Sparkles size={22} />
                                </div>
                                <div>
                                    <span className="font-semibold text-sm text-white block">Reader-Themed Avatars</span>
                                    <span className="text-xs text-slate-400">Choose from Cultivator, Arcanist, Celestial, etc.</span>
                                </div>
                            </button>

                            {/* Remove Avatar (if customized) */}
                            {hasCustomAvatar && onRemovePhoto && (
                                <button
                                    onClick={() => handleAction(onRemovePhoto)}
                                    className="flex items-center gap-3.5 w-full p-3.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 active:scale-[0.98] transition-all text-left group"
                                >
                                    <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-rose-500/20 text-rose-400 group-hover:bg-rose-500 group-hover:text-white transition-colors">
                                        <Trash2 size={22} />
                                    </div>
                                    <div>
                                        <span className="font-semibold text-sm text-rose-400 block">Remove Photo</span>
                                        <span className="text-xs text-rose-300/70">Reset to default reader avatar</span>
                                    </div>
                                </button>
                            )}
                        </div>

                        {/* Cancel Button */}
                        <div className="pt-2">
                            <button
                                onClick={() => {
                                    triggerHaptic();
                                    onClose();
                                }}
                                className="w-full py-3.5 text-center text-sm font-semibold text-slate-300 bg-white/5 hover:bg-white/10 rounded-xl transition-colors active:scale-[0.99]"
                            >
                                Cancel
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};
