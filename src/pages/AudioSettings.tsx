import { useState, useEffect } from 'react';
import { Zap, Flame, Trees, CloudRain, Music, Mic } from 'lucide-react';
import { audioService } from '../services/audio.service';
import { Navbar } from '../components/Navbar';
import clsx from 'clsx';
import { Link } from 'react-router-dom';

export const AudioSettings = () => {
    // const navigate = useNavigate(); // Unused now
    const [voice, setVoice] = useState<'female' | 'male'>('female');
    const [rate, setRate] = useState(1.2);
    const [pitch, setPitch] = useState(0);
    const [ambience, setAmbience] = useState<'rainy' | 'fireplace' | 'forest' | null>(null);
    const [bgmEnabled, setBgmEnabled] = useState(true);
    const [voiceVolume, setVoiceVolume] = useState(80);
    const [bgmVolume, setBgmVolume] = useState(35);

    // Load voices and update settings
    useEffect(() => {
        const updateVoices = () => {
            const voices = audioService.getVoices();
            if (voices.length > 0) {
                const selectedVoice = voices.find(v =>
                    voice === 'female' ? v.name.includes('Female') || v.name.includes('Sira') || v.name.includes('Zira') || v.name.includes('Google')
                        : v.name.includes('Male') || v.name.includes('David')
                ) || voices[0];

                audioService.setSettings({
                    rate: rate,
                    pitch: 1.0 + (pitch * 0.1),
                    voice: selectedVoice
                });
            }
        };

        updateVoices();
        if (typeof window !== 'undefined' && window.speechSynthesis) {
            window.speechSynthesis.onvoiceschanged = updateVoices;
        }

        return () => {
            if (typeof window !== 'undefined' && window.speechSynthesis) {
                window.speechSynthesis.onvoiceschanged = null;
            }
        };
    }, [rate, pitch, voice]);

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
            <div className="sticky top-0 z-20 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md px-4 py-4 pt-[18px] shrink-0 border-b border-slate-200 dark:border-white/5">
                <div className="flex items-center justify-between">
                    <Link to="/profile" className="flex items-center justify-center p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors">
                        <div className="flex size-9 shrink-0 items-center overflow-hidden rounded-full ring-2 ring-primary/20">
                            <div className="bg-center bg-no-repeat aspect-square bg-cover size-full" style={{ backgroundImage: 'url("https://lh3.googleusercontent.com/aida-public/AB6AXuDjCOham51YfTM7PcgkgKspU9PvDHuom_3rGeCzHDOnhZnOzp09BhpYTuEnobo9LY8vOsfLsujPy9_QEMQ7WaQQSrFMdLgnji7T5irQ-C7DSmSq-0RKsDtEHLdFk2Jd7O9Qpw1VCPG_71gSZCD9ROyRef4a9hy1bzxv5Kmeyh5eiAx9wKqIXAtSkLrqYxyMQFSb2RIi6syEVabDEHarMZ8ece6wHlOJW3ky5o3LtKvE3JC2EZaJpRlwT5R61uO6G-mUqtqV5qNjIYyE")' }}></div>
                        </div>
                    </Link>
                    <h2 className="text-xl font-bold leading-tight tracking-tight">AI Audio Settings</h2>
                    <div className="w-10"></div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-40">
                <div className="mt-4 mb-8">
                    <h3 className="text-sm font-semibold text-slate-400 mb-3 uppercase tracking-wider">Voice Selector</h3>
                    <div className="grid grid-cols-2 gap-3 mb-4">
                        <button
                            onClick={() => setVoice('male')}
                            className={clsx(
                                "relative flex flex-col items-center gap-3 p-4 rounded-2xl border-2 transition-all",
                                voice === 'male' ? "bg-primary/10 border-primary/40 ring-2 ring-primary/20" : "bg-slate-100 dark:bg-[#2b2839] border-transparent hover:border-slate-200 dark:hover:border-white/10"
                            )}
                        >
                            <div className="size-14 rounded-full bg-slate-700 flex items-center justify-center">
                                <span className="text-3xl">👨</span>
                            </div>
                            <div className="text-center">
                                <p className="font-bold text-sm">Male Voices</p>
                                <p className="text-[10px] text-slate-400">Deep & Resonance</p>
                            </div>
                            {voice === 'male' && (
                                <div className="absolute top-2 right-2 text-primary">
                                    <div className="size-4 bg-primary rounded-full"></div>
                                </div>
                            )}
                        </button>
                        <button
                            onClick={() => setVoice('female')}
                            className={clsx(
                                "relative flex flex-col items-center gap-3 p-4 rounded-2xl border-2 transition-all",
                                voice === 'female' ? "bg-primary/10 border-primary/40 ring-2 ring-primary/20" : "bg-slate-100 dark:bg-[#2b2839] border-transparent hover:border-slate-200 dark:hover:border-white/10"
                            )}
                        >
                            <div className="size-14 rounded-full bg-slate-700 flex items-center justify-center">
                                <span className="text-3xl">👩</span>
                            </div>
                            <div className="text-center">
                                <p className="font-bold text-sm">Female Voices</p>
                                <p className="text-[10px] text-slate-400">Soft & Clear</p>
                            </div>
                            {voice === 'female' && (
                                <div className="absolute top-2 right-2 text-primary">
                                    <div className="size-4 bg-primary rounded-full"></div>
                                </div>
                            )}
                        </button>
                    </div>

                    {/* Specific Voice Dropdown */}
                    <div className="w-full">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1 block">Specific Voice</label>
                        <select
                            className="w-full bg-slate-100 dark:bg-[#2b2839] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white rounded-lg p-3 outline-none focus:border-primary/50 text-sm"
                            onChange={(e) => {
                                const voices = audioService.getVoices();
                                const selected = voices.find(v => v.name === e.target.value);
                                if (selected) {
                                    audioService.setSettings({ voice: selected });
                                }
                            }}
                        >
                            {audioService.getVoices()
                                .filter(v => {
                                    // Filter for English voices only
                                    if (!v.lang.startsWith('en')) return false;

                                    const name = v.name.toLowerCase();
                                    // Keywords for female voices
                                    const femaleKeywords = ['female', 'zira', 'sira', 'susan', 'catherine', 'linda', 'heather', 'hazel', 'heera'];
                                    // Keywords for male voices
                                    const maleKeywords = ['male', 'david', 'james', 'mark', 'richard', 'george', 'ravi', 'sean'];

                                    const isExplicitlyFemale = femaleKeywords.some(k => name.includes(k));
                                    const isExplicitlyMale = maleKeywords.some(k => name.includes(k));

                                    if (voice === 'female') {
                                        // Show if explicitly female OR (not explicitly male AND not a known male name)
                                        return isExplicitlyFemale || !isExplicitlyMale;
                                    } else {
                                        // Show if explicitly male OR (not explicitly female AND not a known female name)
                                        return isExplicitlyMale || !isExplicitlyFemale;
                                    }
                                })
                                .sort((a, b) => {
                                    // Prioritize Natural / Google voices
                                    const aPriority = a.name.includes('Natural') || a.name.includes('Google');
                                    const bPriority = b.name.includes('Natural') || b.name.includes('Google');
                                    if (aPriority && !bPriority) return -1;
                                    if (!aPriority && bPriority) return 1;
                                    return a.name.localeCompare(b.name);
                                })
                                .map(v => (
                                    <option key={v.name} value={v.name}>{v.name}</option>
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
                                onClick={() => setBgmEnabled(!bgmEnabled)}
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
                                onChange={(e) => setVoiceVolume(parseInt(e.target.value))}
                                className="flex-1 h-2 bg-gray-200 dark:bg-white/20 rounded-lg appearance-none cursor-pointer accent-primary"
                            />
                            <span className="text-xs font-mono w-8 text-right">{voiceVolume}%</span>
                        </div>
                        <div className="flex items-center gap-4">
                            <Music className="opacity-50" />
                            <input
                                type="range" min="0" max="100" value={bgmVolume}
                                onChange={(e) => setBgmVolume(parseInt(e.target.value))}
                                className="flex-1 h-2 bg-gray-200 dark:bg-white/20 rounded-lg appearance-none cursor-pointer accent-primary"
                            />
                            <span className="text-xs font-mono w-8 text-right">{bgmVolume}%</span>
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



            <Navbar />
        </div>
    );
};
