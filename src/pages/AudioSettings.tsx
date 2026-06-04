import { useState, useEffect } from 'react';
import { Mic, FastForward, Play, Activity } from 'lucide-react';
import { audioService, type VoiceInfo } from '../services/audio.service';
import { FooterNavigation } from '../components/FooterNavigation';
import { Header } from '../components/Header';
import clsx from 'clsx';
import { Link } from 'react-router-dom';
import { settingsService } from '../services/settings.service';
import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';
import { motion } from 'framer-motion';

export const AudioSettings = () => {
    const [rate, setRate] = useState(settingsService.getSettings().ttsRate);
    const [availableVoices, setAvailableVoices] = useState<VoiceInfo[]>([]);
    const [profileImage, setProfileImage] = useState<string | null>(null);
    const [selectedVoiceName, setSelectedVoiceName] = useState<string | null>(settingsService.getSettings().ttsVoice);
    const [isPreviewing, setIsPreviewing] = useState(false);

    // Load voices and update settings
    useEffect(() => {
        const updateVoices = () => {
            const voices = audioService.getVoices();
            setAvailableVoices(voices);

            if (voices.length > 0) {
                // Try to find the persisted voice if available
                const savedVoiceName = settingsService.getSettings().ttsVoice;
                let selected = voices.find(v => v.name === savedVoiceName);

                if (!selected) {
                    selected = audioService.getBestVoice('female') || voices[0];
                }

                audioService.setSettings({
                    rate: rate,
                    voiceName: selected.name
                });
                setSelectedVoiceName(selected.name);
            }
        };

        updateVoices();
        if (typeof window !== 'undefined' && window.speechSynthesis) {
            window.speechSynthesis.onvoiceschanged = updateVoices;

            // Some mobile browsers need a small delay or re-poll
            const timer = setTimeout(updateVoices, 100);
            return () => {
                window.speechSynthesis.onvoiceschanged = null;
                clearTimeout(timer);
            };
        }
    }, [rate]);

    // Load profile image
    useEffect(() => {
        const loadProfileImage = async () => {
            try {
                const { value } = await Preferences.get({ key: 'profileImage' });
                if (value) {
                    setProfileImage(
                        value.startsWith('file://') ? Capacitor.convertFileSrc(value) : value
                    );
                }
            } catch (e) {
                console.error("Failed to load profile image", e);
            }
        };
        loadProfileImage();
    }, []);

    const handleVoiceSelect = (voice: VoiceInfo) => {
        audioService.setSettings({ voiceName: voice.name });
        setSelectedVoiceName(voice.name);
        settingsService.updateSettings({ ttsVoice: voice.name });
    };

    const handlePreview = async () => {
        setIsPreviewing(true);
        await audioService.previewVoice();
        setTimeout(() => setIsPreviewing(false), 2500); // approximate reset
    };

    const sortedVoices = availableVoices
        .filter(v => v.lang.startsWith(navigator.language.split('-')[0]) || v.lang.startsWith('en')) // Dynamic language filter (system lang + English)
        .sort((a, b) => {
            const aPriority = a.name.includes('Natural') || a.name.includes('Google') || a.name.includes('Premium');
            const bPriority = b.name.includes('Natural') || b.name.includes('Google') || b.name.includes('Premium');
            if (aPriority && !bPriority) return -1;
            if (!aPriority && bPriority) return 1;
            return a.name.localeCompare(b.name);
        });

    return (
        <div className="bg-[#f8fafc] dark:bg-[#0b0f19] text-slate-900 dark:text-white h-screen overflow-hidden font-sans flex flex-col transition-colors duration-300">
            {/* Header */}
            <Header
                title="AI Audio Reader"
                leftContent={
                    <Link to="/profile" className="flex items-center justify-center p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors">
                        <div className="flex size-9 shrink-0 items-center overflow-hidden rounded-full ring-2 ring-indigo-500/30">
                            {profileImage ? (
                                <img src={profileImage} alt="Profile" className="size-full object-cover" />
                            ) : (
                                <div className="bg-center bg-no-repeat aspect-square bg-cover size-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center">
                                    <span className="text-lg">👤</span>
                                </div>
                            )}
                        </div>
                    </Link>
                }
                className="border-b border-slate-100 dark:border-white/5 bg-[#f8fafc]/90 dark:bg-[#0b0f19]/90 backdrop-blur-xl"
                transparent
            />

            <div className="flex-1 overflow-y-auto px-6 pb-40">
                {/* Hero / Now Playing */}
                <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="relative mt-4 mb-10 p-6 rounded-3xl overflow-hidden bg-gradient-to-br from-indigo-500 via-purple-600 to-violet-700 shadow-xl shadow-indigo-500/20"
                >
                    <div className="absolute top-0 right-0 p-4 opacity-20">
                        <Activity size={120} className="text-white" />
                    </div>
                    
                    <div className="relative z-10 flex flex-col h-full justify-between gap-6">
                        <div>
                            <span className="inline-block px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-white text-[10px] font-bold tracking-widest uppercase mb-4">
                                Active Voice
                            </span>
                            <h2 className="text-2xl font-black text-white tracking-tight leading-tight">
                                {selectedVoiceName || "Select a Voice"}
                            </h2>
                            <p className="text-indigo-100/80 text-xs font-medium mt-1">
                                Natural AI Text-to-Speech Engine
                            </p>
                        </div>
                        
                        <button
                            onClick={handlePreview}
                            disabled={isPreviewing}
                            className={clsx(
                                "flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-sm backdrop-blur-md transition-all",
                                isPreviewing 
                                    ? "bg-white/40 text-white shadow-inner" 
                                    : "bg-white text-indigo-600 shadow-lg hover:scale-[1.02] active:scale-95"
                            )}
                        >
                            {isPreviewing ? <Activity size={18} className="animate-pulse" /> : <Play size={18} className="fill-indigo-600" />}
                            {isPreviewing ? "Playing..." : "Preview Voice"}
                        </button>
                    </div>
                </motion.div>

                {/* Speed Control */}
                <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="bg-white dark:bg-[#151a2a] rounded-3xl p-6 shadow-sm border border-slate-100 dark:border-white/5 mb-8"
                >
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <div className="size-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
                                <FastForward className="text-violet-500" size={18} />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">Reading Speed</h3>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Adjust narration pacing</p>
                            </div>
                        </div>
                        <div className="px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-white/10">
                            <span className="text-violet-500 font-black text-sm">{rate.toFixed(1)}x</span>
                        </div>
                    </div>
                    
                    <div className="relative pt-2 pb-4">
                        <input
                            className="w-full accent-violet-500 h-2 bg-slate-100 dark:bg-slate-800 rounded-full appearance-none cursor-pointer"
                            type="range"
                            min="0.5" max="2.0" step="0.1"
                            value={rate}
                            onChange={(e) => setRate(parseFloat(e.target.value))}
                        />
                        <div className="flex justify-between mt-3 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                            <span>Slow</span>
                            <span>Normal</span>
                            <span>Fast</span>
                        </div>
                    </div>
                </motion.div>

                {/* Voice Selection List */}
                <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                >
                    <div className="flex items-center justify-between mb-4 px-2">
                        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                            <Mic size={16} className="text-indigo-500" />
                            Available Voices
                        </h3>
                        <span className="text-[10px] font-bold text-slate-400 bg-slate-200 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                            {sortedVoices.length} Found
                        </span>
                    </div>

                    <div className="space-y-3">
                        {sortedVoices.length === 0 ? (
                            <div className="p-6 text-center text-slate-400 text-sm bg-white dark:bg-[#151a2a] rounded-3xl border border-slate-100 dark:border-white/5">
                                Loading voices or no voices available on this device...
                            </div>
                        ) : (
                            sortedVoices.map((v) => {
                                const isSelected = selectedVoiceName === v.name;
                                const isPremium = v.name.includes('Natural') || v.name.includes('Premium') || v.name.includes('Google');
                                
                                return (
                                    <button
                                        key={v.name}
                                        onClick={() => handleVoiceSelect(v)}
                                        className={clsx(
                                            "w-full flex items-center justify-between p-4 rounded-2xl border transition-all text-left",
                                            isSelected 
                                                ? "bg-indigo-500/10 border-indigo-500/50 dark:bg-indigo-500/20 shadow-sm" 
                                                : "bg-white dark:bg-[#151a2a] border-slate-100 dark:border-white/5 hover:border-indigo-500/30 active:scale-[0.98]"
                                        )}
                                    >
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className={clsx("font-bold text-sm", isSelected ? "text-indigo-600 dark:text-indigo-400" : "text-slate-700 dark:text-slate-300")}>
                                                    {v.name}
                                                </span>
                                                {isPremium && (
                                                    <span className="bg-gradient-to-r from-amber-400 to-orange-500 text-white text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded flex items-center gap-0.5 shadow-sm">
                                                        Premium
                                                    </span>
                                                )}
                                            </div>
                                            <span className="text-xs text-slate-400 font-medium">
                                                {v.lang}
                                            </span>
                                        </div>
                                        
                                        <div className={clsx(
                                            "size-5 rounded-full border-2 flex items-center justify-center transition-colors",
                                            isSelected ? "border-indigo-500" : "border-slate-300 dark:border-slate-600"
                                        )}>
                                            {isSelected && <div className="size-2.5 bg-indigo-500 rounded-full" />}
                                        </div>
                                    </button>
                                );
                            })
                        )}
                    </div>
                </motion.div>
            </div>

            <FooterNavigation />
        </div>
    );
};
