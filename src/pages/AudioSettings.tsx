import { useState, useEffect } from 'react';
import { ArrowLeft, Play, SkipBack, SkipForward, Zap, Flame, Trees, CloudRain, Music, Mic } from 'lucide-react';
import { audioService } from '../services/audio.service';
import { BottomNav } from '../components/BottomNav';
import clsx from 'clsx';
import { useNavigate } from 'react-router-dom';

export const AudioSettings = () => {
    const navigate = useNavigate();
    const [voice, setVoice] = useState<'female' | 'male'>('female');
    const [rate, setRate] = useState(1.2);
    const [pitch, setPitch] = useState(0);
    const [ambience, setAmbience] = useState<'rainy' | 'fireplace' | 'forest' | null>(null);
    const [bgmEnabled, setBgmEnabled] = useState(true);
    const [voiceVolume, setVoiceVolume] = useState(80);
    const [bgmVolume, setBgmVolume] = useState(35);

    // Apply settings whenever they change
    useEffect(() => {
        // Find a matching voice from synthesis
        const voices = audioService.getVoices();
        const selectedVoice = voices.find(v =>
            voice === 'female' ? v.name.includes('Female') || v.name.includes('Sira') || v.name.includes('Zira')
                : v.name.includes('Male') || v.name.includes('David')
        ) || voices[0];

        audioService.setSettings({
            rate: rate,
            // Convert slider -5 to 5 range to 0.5 to 1.5 pitch (approx)
            pitch: 1.0 + (pitch * 0.1),
            voice: selectedVoice
        });
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

    const handleTestAudio = async () => {
        audioService.stopSpeaking();
        audioService.stopBGM();

        if (bgmEnabled) {
            // Basic category loop for now, ideally this plays selected ambience or specific BGM
            audioService.playBGM('fantasy');
        }

        const sampleText = "This is a preview of the AI narrator voice. The background music should be playing softly.";
        audioService.speak(sampleText);
    };

    return (
        <div className="bg-background-dark text-white min-h-screen pb-24 font-sans">
            <div className="relative flex h-full min-h-screen w-full flex-col overflow-x-hidden">
                {/* Header */}
                <div className="sticky top-0 z-20 bg-background-dark/80 backdrop-blur-md px-4 py-4">
                    <div className="flex items-center justify-between">
                        <button onClick={() => navigate(-1)} className="flex size-10 items-center justify-center rounded-full hover:bg-white/10 transition-colors">
                            <ArrowLeft size={20} />
                        </button>
                        <h2 className="text-xl font-bold leading-tight tracking-tight">AI Audio Settings</h2>
                        <div className="w-10"></div>
                    </div>
                </div>

                <div className="flex-1 px-4 pb-40">
                    {/* Voice Selector */}
                    <div className="mt-4 mb-8">
                        <h3 className="text-sm font-semibold text-slate-400 mb-3 uppercase tracking-wider">Voice Selector</h3>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => setVoice('male')}
                                className={clsx(
                                    "relative flex flex-col items-center gap-3 p-4 rounded-2xl border-2 transition-all",
                                    voice === 'male' ? "bg-white/5 border-primary/40 ring-2 ring-primary/20" : "bg-[#2b2839] border-transparent hover:border-white/10"
                                )}
                            >
                                <div className="size-14 rounded-full bg-slate-700 flex items-center justify-center">
                                    <span className="text-3xl">👨</span>
                                </div>
                                <div className="text-center">
                                    <p className="font-bold text-sm">Natural Male</p>
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
                                    voice === 'female' ? "bg-white/5 border-primary/40 ring-2 ring-primary/20" : "bg-[#2b2839] border-transparent hover:border-white/10"
                                )}
                            >
                                <div className="size-14 rounded-full bg-slate-700 flex items-center justify-center">
                                    <span className="text-3xl">👩</span>
                                </div>
                                <div className="text-center">
                                    <p className="font-bold text-sm">Natural Female</p>
                                    <p className="text-[10px] text-slate-400">Soft & Clear</p>
                                </div>
                                {voice === 'female' && (
                                    <div className="absolute top-2 right-2 text-primary">
                                        <div className="size-4 bg-primary rounded-full"></div>
                                    </div>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Sliders */}
                    <div className="space-y-8 mb-8">
                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2">
                                    <Zap className="text-purple-400" size={18} />
                                    <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Reading Speed</h3>
                                </div>
                                <span className="text-purple-400 font-bold">{rate}x</span>
                            </div>
                            <input
                                className="w-full accent-purple-500 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer"
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
                                    <Zap className="text-purple-400" size={18} />
                                    <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Voice Pitch</h3>
                                </div>
                                <span className="text-purple-400 font-bold">{pitch > 0 ? `+${pitch}` : pitch}</span>
                            </div>
                            <input
                                className="w-full accent-purple-500 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer"
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
                    <div className="bg-[#2b2839] rounded-2xl p-5 border border-white/5 mb-8">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="font-bold text-sm flex items-center gap-2">
                                <Music className="text-primary" size={18} /> Audio Mix
                            </h3>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setBgmEnabled(!bgmEnabled)}
                                    className={clsx("px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-colors", bgmEnabled ? 'bg-primary text-white' : 'bg-white/10 text-slate-400')}
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
                            <div className="flex items-center justify-between p-4 rounded-xl bg-[#2b2839] border border-white/5">
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
                            <div className="flex items-center justify-between p-4 rounded-xl bg-[#2b2839] border border-white/5">
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
                            <div className="flex items-center justify-between p-4 rounded-xl bg-[#2b2839] border border-white/5">
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

                {/* Mini Player */}
                <div className="fixed bottom-24 left-4 right-4 z-30">
                    <div className="flex items-center gap-3 bg-[#2b2839]/95 backdrop-blur-xl border border-white/10 rounded-2xl p-3 shadow-2xl">
                        <div className="size-12 rounded-xl overflow-hidden bg-cover bg-center shrink-0 shadow-lg ring-1 ring-white/10" style={{ backgroundImage: "url('https://lh3.googleusercontent.com/aida-public/AB6AXuDbYlPlCtl5nXUzCPiYMP7SCXWeQ84w9NmucBWNGlCDCGQ5pM3kiBXVc7tioeSumgFh2OxNfH01ImNdLaNPzO4R_J9tbfFWpFd61DqeK0yIbeCsjidWDANWpgko2zXbKIAuorbpjfDeP40e_YWPjaRx4bAugS8X3vqlRfn8Urw1tJVQS759n8g7KEr8QXYU4Bp1XDj-xK8t60KBQ1ZRnhSBWjvb6C7qQvMtGq0XfGwZePwWhdpejt3Fe1wLRYozX1-LXpL_is3Okeww')" }}></div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold truncate">The Shadow Weaver</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                                <div className="flex gap-0.5 items-end h-2.5">
                                    <div className="w-0.5 bg-purple-500 h-2 animate-pulse"></div>
                                    <div className="w-0.5 bg-purple-500 h-full animate-pulse"></div>
                                    <div className="w-0.5 bg-purple-500 h-1.5 animate-pulse"></div>
                                </div>
                                <p className="text-[10px] text-purple-400 font-bold uppercase tracking-wider">AI Voice Active</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-1">
                            <button className="size-9 flex items-center justify-center rounded-full hover:bg-white/10">
                                <SkipBack size={20} />
                            </button>
                            <button
                                className="size-10 flex items-center justify-center rounded-full bg-primary text-white shadow-lg shadow-primary/20"
                                onClick={handleTestAudio}
                            >
                                <Play size={24} className="ml-0.5 fill-current" />
                            </button>
                            <button className="size-9 flex items-center justify-center rounded-full hover:bg-white/10">
                                <SkipForward size={20} />
                            </button>
                        </div>
                    </div>
                </div>

                <BottomNav />
            </div>
        </div>
    );
};
