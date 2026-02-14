import { useState, useEffect } from 'react';
import { Zap, Flame, Trees, CloudRain, Music, Mic } from 'lucide-react';
import { audioService, type VoiceInfo } from '../services/audio.service';
import { FooterNavigation } from '../components/FooterNavigation';
import { Header } from '../components/Header';
import clsx from 'clsx';
import { Link } from 'react-router-dom';
import { settingsService } from '../services/settings.service';
import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';

export const AudioSettings = () => {
    // const navigate = useNavigate(); // Unused now
    const [rate, setRate] = useState(settingsService.getSettings().ttsRate);
    const [ambience, setAmbience] = useState<'rainy' | 'fireplace' | 'forest' | null>(settingsService.getSettings().ambience);
    const [bgmEnabled, setBgmEnabled] = useState(settingsService.getSettings().isMusicEnabled);
    const [voiceVolume, setVoiceVolume] = useState(80);
    const [bgmVolume, setBgmVolume] = useState(35);
    const [availableVoices, setAvailableVoices] = useState<VoiceInfo[]>([]);
    const [profileImage, setProfileImage] = useState<string | null>(null);

    // Convert stored pitch (0.5-1.5 or 0 default) to slider value (-5 to 5)
    // Default 0 in settings means unset, which maps to 0 slider (1.0 pitch)
    // Stored 1.0 maps to 0 slider.
    const initialPitchVal = settingsService.getSettings().ttsPitch;
    const [pitch, setPitch] = useState(initialPitchVal === 0 ? 0 : Math.round((initialPitchVal - 1.0) * 10));

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
                    selected = voices[0];
                }

                audioService.setSettings({
                    rate: rate,
                    pitch: 1.0 + (pitch * 0.1),
                    voiceName: selected.name
                });
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
    }, [rate, pitch]);

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

    const toggleAmbience = (track: 'rainy' | 'fireplace' | 'forest') => {
        if (ambience === track) {
            audioService.stopBGM();
            setAmbience(null);
        } else {
            audioService.playAmbience(track);
            setAmbience(track);
        }
    };



    return (
        <div className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-white min-h-screen font-sans flex flex-col transition-colors duration-300">
            {/* Header */}
            <Header
                title="AI Audio Settings"
                leftContent={
                    <Link to="/profile" className="flex items-center justify-center p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors">
                        <div className="flex size-9 shrink-0 items-center overflow-hidden rounded-full ring-2 ring-primary/20">
                            {profileImage ? (
                                <img src={profileImage} alt="Profile" className="size-full object-cover" />
                            ) : (
                                <div className="bg-center bg-no-repeat aspect-square bg-cover size-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
                                    <span className="text-lg">👤</span>
                                </div>
                            )}
                        </div>
                    </Link>
                }
                className="border-b border-slate-200 dark:border-white/5"
            />

            <div className="flex-1 overflow-y-auto px-4 pb-40">
                {/* Actions Grid */}
                <div className="grid grid-cols-2 gap-3 mb-6">
                    <button
                        onClick={() => audioService.previewVoice()}
                        className="flex items-center justify-center gap-2 py-3 bg-slate-100 dark:bg-[#2b2839] border border-slate-200 dark:border-white/5 rounded-xl font-bold text-sm active:scale-95 transition-transform"
                    >
                        <Mic size={18} className="text-primary" />
                        Preview Voice
                    </button>
                    <button
                        onClick={() => {
                            const result = audioService.applyNaturalPreset();
                            setRate(result.rate);
                            setPitch(result.pitch);
                            const btn = document.getElementById('natural-btn');
                            if (btn) {
                                btn.innerText = "Applied! ✅";
                                setTimeout(() => btn.innerText = "Create Natural", 1500);
                            }
                        }}
                        id="natural-btn"
                        className="flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl font-bold shadow-lg shadow-emerald-500/20 active:scale-95 transition-transform"
                    >
                        <Zap size={18} className="fill-white" />
                        Natural Preset
                    </button>
                </div>

                <div className="mt-4 mb-8">
                    <h3 className="text-sm font-semibold text-slate-400 mb-3 uppercase tracking-wider">Voice Selection</h3>

                    {/* Specific Voice Dropdown */}
                    <div className="w-full">
                        <select
                            className="w-full bg-slate-100 dark:bg-[#2b2839] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white rounded-lg p-3 outline-none focus:border-primary/50 text-sm"
                            onChange={(e) => {
                                const selected = availableVoices.find(v => v.name === e.target.value);
                                if (selected) {
                                    audioService.setSettings({ voiceName: selected.name });
                                }
                            }}
                            value={settingsService.getSettings().ttsVoice || ''}
                            key={settingsService.getSettings().ttsVoice}
                        >
                            {availableVoices
                                .filter(v => v.lang.startsWith(navigator.language.split('-')[0]) || v.lang.startsWith('en')) // Dynamic language filter (system lang + English)
                                .sort((a, b) => {
                                    const aPriority = a.name.includes('Natural') || a.name.includes('Google');
                                    const bPriority = b.name.includes('Natural') || b.name.includes('Google');
                                    if (aPriority && !bPriority) return -1;
                                    if (!aPriority && bPriority) return 1;
                                    return a.name.localeCompare(b.name);
                                })
                                .map(v => (
                                    <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>
                                ))}
                        </select>
                    </div>
                </div>

                {/* Sliders */}
                <div className="space-y-8 mb-8">
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <Zap className="text-primary" size={18} />
                                <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Reading Speed</h3>
                            </div>
                            <span className="text-primary font-bold">{rate}x</span>
                        </div>
                        <input
                            className="w-full accent-primary h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer"
                            type="range"
                            min="0.5" max="2.0" step="0.1"
                            value={rate}
                            onChange={(e) => setRate(parseFloat(e.target.value))}
                        />
                        <div className="flex justify-between mt-2 text-[10px] text-slate-500 font-medium">
                            <span>0.5x</span>
                            <span>Normal</span>
                            <span>2.0x</span>
                        </div>
                    </div>
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <Zap className="text-primary" size={18} />
                                <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Voice Pitch</h3>
                            </div>
                            <span className="text-primary font-bold">{pitch > 0 ? `+${pitch}` : pitch}</span>
                        </div>
                        <input
                            className="w-full accent-primary h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer"
                            type="range"
                            min="-5" max="5" step="1"
                            value={pitch}
                            onChange={(e) => setPitch(parseInt(e.target.value))}
                        />
                        <div className="flex justify-between mt-2 text-[10px] text-slate-500 font-medium">
                            <span>Low</span>
                            <span>Neutral</span>
                            <span>High</span>
                        </div>
                    </div>
                </div>

                {/* Audio Mixer */}
                <div className="bg-slate-100 dark:bg-[#2b2839] rounded-2xl p-5 border border-slate-200 dark:border-white/5 mb-8">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="font-bold text-sm flex items-center gap-2">
                            <Music className="text-primary" size={18} /> Audio Mix
                        </h3>
                        <div className="flex gap-2">
                            <button
                                onClick={() => {
                                    const next = !bgmEnabled;
                                    setBgmEnabled(next);
                                    settingsService.updateSettings({ isMusicEnabled: next });
                                    if (!next) audioService.stopBGM();
                                }}
                                className={clsx("px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-colors", bgmEnabled ? 'bg-primary text-white' : 'bg-slate-200 dark:bg-white/10 text-slate-500 dark:text-slate-400')}
                            >
                                {bgmEnabled ? 'BGM ON' : 'BGM OFF'}
                            </button>
                        </div>
                    </div>

                    <div className="space-y-5">
                        <div className="flex items-center gap-4">
                            <Mic className="opacity-50" />
                            <input
                                type="range" min="0" max="100" value={voiceVolume}
                                onChange={(e) => {
                                    const val = parseInt(e.target.value);
                                    setVoiceVolume(val);
                                    // Debounce or direct? Direct for volume feels better usually
                                    audioService.setVoiceVolume(val);
                                }}
                                className="flex-1 h-2 bg-gray-200 dark:bg-white/20 rounded-lg appearance-none cursor-pointer accent-primary"
                            />
                            <span className="text-xs font-mono w-8 text-right">{voiceVolume}%</span>
                        </div>
                        <div className="flex items-center gap-4">
                            <Music className="opacity-50" />
                            <input
                                type="range" min="0" max="100" value={bgmVolume}
                                onChange={(e) => {
                                    const val = parseInt(e.target.value);
                                    setBgmVolume(val);
                                    audioService.setBgmVolume(val);
                                }}
                                className="flex-1 h-2 bg-gray-200 dark:bg-white/20 rounded-lg appearance-none cursor-pointer accent-primary"
                            />
                            <span className="text-xs font-mono w-8 text-right">{bgmVolume}%</span>
                        </div>
                    </div>
                </div>

                {/* Sleep Timer & Auto-Next */}
                <div className="space-y-4 mb-8">
                    <div className="bg-slate-100 dark:bg-[#2b2839] rounded-2xl p-5 border border-slate-200 dark:border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="size-10 rounded-lg bg-indigo-500/20 flex items-center justify-center text-indigo-400">
                                <span className="font-bold text-lg">💤</span>
                            </div>
                            <div>
                                <p className="text-sm font-bold">Sleep Timer</p>
                                <p className="text-[10px] text-slate-400">Stop audio after set time</p>
                            </div>
                        </div>
                        <div className="flex gap-1 bg-slate-200 dark:bg-black/20 p-1 rounded-lg">
                            {[0, 15, 30, 60].map(mins => (
                                <button
                                    key={mins}
                                    onClick={() => {
                                        audioService.startSleepTimer(mins);
                                        // Force update UI (optional since we don't track timer state in UI strictly here, but could add state)
                                    }}
                                    className={clsx(
                                        "px-3 py-1.5 rounded-md text-[10px] font-bold transition-all",
                                        settingsService.getSettings().sleepTimer === mins
                                            ? "bg-white dark:bg-slate-700 shadow-sm text-primary"
                                            : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                                    )}
                                >
                                    {mins === 0 ? 'Off' : `${mins}m`}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="bg-slate-100 dark:bg-[#2b2839] rounded-2xl p-5 border border-slate-200 dark:border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="size-10 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                                <span className="font-bold text-lg">⏭️</span>
                            </div>
                            <div>
                                <p className="text-sm font-bold">Auto-Next Chapter</p>
                                <p className="text-[10px] text-slate-400">Continue reading automatically</p>
                            </div>
                        </div>
                        <div
                            onClick={() => settingsService.updateSettings({ autoNextChapter: !settingsService.getSettings().autoNextChapter })}
                            className={clsx("w-12 h-6 rounded-full p-1 transition-colors cursor-pointer", settingsService.getSettings().autoNextChapter ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600")}
                        >
                            <div className={clsx("size-4 bg-white rounded-full shadow-sm transition-transform", settingsService.getSettings().autoNextChapter ? "translate-x-6" : "translate-x-0")} />
                        </div>
                    </div>
                </div>

                {/* Mood Music */}
                <div className="mb-8">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Mood Music</h3>
                        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/30">
                            <span className="text-[10px] font-bold text-purple-400 uppercase tracking-tighter">AI Dynamic</span>
                        </div>
                    </div>
                    <div className="space-y-3">
                        <div className="flex items-center justify-between p-4 rounded-xl bg-primary/10 dark:bg-[#2b2839] border border-slate-200 dark:border-white/5">
                            <div className="flex items-center gap-3">
                                <div className="size-10 rounded-lg bg-indigo-500/20 flex items-center justify-center text-indigo-400">
                                    <CloudRain size={20} />
                                </div>
                                <div>
                                    <p className="text-sm font-bold">Rainy Library</p>
                                    <p className="text-[10px] text-slate-400">Cozy pitter-patter ambiance</p>
                                </div>
                            </div>
                            <div
                                className={clsx("relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors", ambience === 'rainy' ? "bg-purple-500" : "bg-slate-700")}
                                onClick={() => toggleAmbience('rainy')}
                            >
                                <span className={clsx("pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out", ambience === 'rainy' ? "translate-x-5" : "translate-x-0")}></span>
                            </div>
                        </div>
                        <div className="flex items-center justify-between p-4 rounded-xl bg-primary/10 dark:bg-[#2b2839] border border-slate-200 dark:border-white/5">
                            <div className="flex items-center gap-3">
                                <div className="size-10 rounded-lg bg-orange-500/20 flex items-center justify-center text-orange-400">
                                    <Flame size={20} />
                                </div>
                                <div>
                                    <p className="text-sm font-bold">Fireplace Crackle</p>
                                    <p className="text-[10px] text-slate-400">Warm evening comfort</p>
                                </div>
                            </div>
                            <div
                                className={clsx("relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors", ambience === 'fireplace' ? "bg-purple-500" : "bg-slate-700")}
                                onClick={() => toggleAmbience('fireplace')}
                            >
                                <span className={clsx("pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out", ambience === 'fireplace' ? "translate-x-5" : "translate-x-0")}></span>
                            </div>
                        </div>
                        <div className="flex items-center justify-between p-4 rounded-xl bg-primary/10 dark:bg-[#2b2839] border border-slate-200 dark:border-white/5">
                            <div className="flex items-center gap-3">
                                <div className="size-10 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                                    <Trees size={20} />
                                </div>
                                <div>
                                    <p className="text-sm font-bold">Midnight Forest</p>
                                    <p className="text-[10px] text-slate-400">Soft winds and rustling leaves</p>
                                </div>
                            </div>
                            <div
                                className={clsx("relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors", ambience === 'forest' ? "bg-purple-500" : "bg-slate-700")}
                                onClick={() => toggleAmbience('forest')}
                            >
                                <span className={clsx("pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out", ambience === 'forest' ? "translate-x-5" : "translate-x-0")}></span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>



            <FooterNavigation />
        </div>
    );
};
