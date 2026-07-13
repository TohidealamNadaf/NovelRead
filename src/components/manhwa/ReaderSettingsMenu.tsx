import React, { useState } from 'react';
import { PanelLeft, PanelBottom, PanelRight, PanelTop, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ProgressBarPosition } from './ReadingProgressBar';
import type { ReaderImageSettings } from '../../pages/ManhwaReader';

interface ReaderSettingsMenuProps {
    isOpen: boolean;
    onClose: () => void;
    position: ProgressBarPosition;
    onPositionSelect: (pos: ProgressBarPosition) => void;
    imageSettings: ReaderImageSettings;
    onImageSettingsChange: (settings: ReaderImageSettings) => void;
}

export const ReaderSettingsMenu: React.FC<ReaderSettingsMenuProps> = ({ 
    isOpen, 
    onClose, 
    position, 
    onPositionSelect,
    imageSettings,
    onImageSettingsChange
}) => {
    const [activeTab, setActiveTab] = useState<'layout' | 'image'>('layout');

    const layoutButtons: { id: ProgressBarPosition; Icon: React.ElementType }[] = [
        { id: 'left', Icon: PanelLeft },
        { id: 'bottom', Icon: PanelBottom },
        { id: 'right', Icon: PanelRight },
        { id: 'top', Icon: PanelTop },
        { id: 'off', Icon: X },
    ];

    const updateSetting = (key: keyof ReaderImageSettings, value: any) => {
        onImageSettingsChange({ ...imageSettings, [key]: value });
    };

    const CheckboxRow = ({ label, checked, onChange }: { label: string, checked: boolean, onChange: (val: boolean) => void }) => (
        <label className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors ${checked ? 'bg-primary/20 border border-primary/40' : 'bg-white/5 border border-transparent'}`}>
            <span className="text-sm text-white/90">{label}</span>
            <div className={`w-5 h-5 rounded-md flex items-center justify-center border transition-colors ${checked ? 'bg-primary border-primary' : 'border-white/20'}`}>
                {checked && <div className="w-2.5 h-2.5 bg-white rounded-sm" />}
            </div>
            <input type="checkbox" className="hidden" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        </label>
    );

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="fixed inset-0 bg-black/40 z-40"
                        onClick={onClose}
                    />

                    {/* Bottom Sheet */}
                    <motion.div
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 20, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-sm"
                        onClick={(e) => e.stopPropagation()}
                        onTouchStart={(e) => e.stopPropagation()}
                        onTouchMove={(e) => e.stopPropagation()}
                        onTouchEnd={(e) => e.stopPropagation()}
                    >
                        <div className="bg-[#1a1a2e]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl p-4 flex flex-col gap-4">
                            
                            {/* Header / Tabs */}
                            <div className="flex items-center justify-between">
                                <div className="flex bg-white/5 p-1 rounded-lg">
                                    <button 
                                        className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-colors ${activeTab === 'layout' ? 'bg-white/10 text-white' : 'text-white/50'}`}
                                        onClick={() => setActiveTab('layout')}
                                    >
                                        Layout
                                    </button>
                                    <button 
                                        className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-colors ${activeTab === 'image' ? 'bg-white/10 text-white' : 'text-white/50'}`}
                                        onClick={() => setActiveTab('image')}
                                    >
                                        Image
                                    </button>
                                </div>
                                <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 text-white/60 hover:bg-white/10 transition-colors">
                                    <X size={18} />
                                </button>
                            </div>

                            {/* Content */}
                            {activeTab === 'layout' && (
                                <div className="flex flex-col gap-2 py-4">
                                    <span className="text-[10px] font-bold text-white/40 tracking-widest uppercase text-center mb-2">Progress Bar Position</span>
                                    <div className="flex items-center justify-center gap-2 w-full">
                                        {layoutButtons.map(({ id, Icon }) => {
                                            const isActive = position === id;
                                            return (
                                                <button
                                                    key={id}
                                                    onClick={() => onPositionSelect(id)}
                                                    className={`w-12 h-12 flex items-center justify-center rounded-full transition-colors ${isActive ? 'bg-primary text-white' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}
                                                >
                                                    <Icon size={20} />
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {activeTab === 'image' && (
                                <div className="flex flex-col gap-4 max-h-[50vh] overflow-y-auto pr-1 pb-2">
                                    <div className="flex flex-col gap-2">
                                        <span className="text-[10px] font-bold text-white/40 tracking-widest uppercase pl-1">Image Sizing</span>
                                        <CheckboxRow label="Fit width" checked={imageSettings.fitWidth} onChange={(v) => updateSetting('fitWidth', v)} />
                                        <CheckboxRow label="Fit height" checked={imageSettings.fitHeight} onChange={(v) => updateSetting('fitHeight', v)} />
                                        <CheckboxRow label="Stretch small images" checked={imageSettings.stretchSmallImages} onChange={(v) => updateSetting('stretchSmallImages', v)} />
                                        <CheckboxRow label="Limit max width" checked={imageSettings.limitMaxWidth} onChange={(v) => updateSetting('limitMaxWidth', v)} />
                                        <CheckboxRow label="Limit max height" checked={imageSettings.limitMaxHeight} onChange={(v) => updateSetting('limitMaxHeight', v)} />
                                    </div>

                                    <div className="flex flex-col gap-2">
                                        <span className="text-[10px] font-bold text-white/40 tracking-widest uppercase pl-1">Image Coloring</span>
                                        <CheckboxRow label="Grayscale" checked={imageSettings.grayscale} onChange={(v) => updateSetting('grayscale', v)} />
                                    </div>

                                    <div className="flex flex-col gap-2 mb-2">
                                        <div className="flex justify-between items-center pl-1 pr-1">
                                            <span className="text-[10px] font-bold text-white/40 tracking-widest uppercase">Dim Screen</span>
                                            <span className="text-xs text-primary font-mono">{imageSettings.dimScreen}%</span>
                                        </div>
                                        <input 
                                            type="range" 
                                            min="0" max="100" step="5"
                                            value={imageSettings.dimScreen}
                                            onChange={(e) => updateSetting('dimScreen', parseInt(e.target.value))}
                                            className="w-full accent-primary h-1.5 bg-white/10 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
                                        />
                                    </div>
                                </div>
                            )}

                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};
