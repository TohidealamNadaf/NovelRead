import { useState, useEffect, useRef } from 'react';
import { Mic, FastForward, Play, Activity, StopCircle, Volume2 } from 'lucide-react';
import { audioService, type VoiceInfo } from '../services/audio.service';
import { FooterNavigation } from '../components/FooterNavigation';
import { Header } from '../components/Header';
import clsx from 'clsx';
import { Link } from 'react-router-dom';
import { settingsService } from '../services/settings.service';
import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { motion, AnimatePresence } from 'framer-motion';

const PREVIEW_TEXT = "The night was dark, the wind was cold, and she ran through the ancient forest as if the whole world was chasing her dreams.";

/**
 * Convert a raw Android voiceURI (e.g. "en-au-x-axf-local") into a readable label.
 * Format: "en-au-x-axf-local" → "English (AU) · Axf · Local"
 */
function prettifyVoiceURI(voiceURI: string, fallbackName: string): { label: string; quality: string; network: boolean } {
    if (!voiceURI || voiceURI === fallbackName) {
        return { label: fallbackName, quality: '', network: false };
    }

    // Android voice IDs: e.g. "en-au-x-axf-local", "en-gb-x-gbc-network", "en-us-x-tpf-local"
    // Pattern: <lang>-<region>-x-<id>-<quality>
    const parts = voiceURI.toLowerCase().split('-');
    const isNetwork = voiceURI.endsWith('-network') || voiceURI.includes('network');
    const isLocal = voiceURI.endsWith('-local') || voiceURI.includes('local');

    // Extract lang+region (first two parts)
    const lang = parts[0] || '';
    const region = parts[1] || '';

    // Extract the voice ID (the part after 'x')
    const xIdx = parts.indexOf('x');
    const voiceId = xIdx >= 0 && xIdx + 1 < parts.length ? parts[xIdx + 1] : '';

    // Map region codes to nice names
    const regionMap: Record<string, string> = {
        us: 'US', gb: 'UK', au: 'AU', in: 'IN', ca: 'CA',
        nz: 'NZ', za: 'ZA', ie: 'IE', sg: 'SG', ph: 'PH',
    };

    const regionLabel = regionMap[region] || region.toUpperCase();
    const langLabel = lang === 'en' ? 'English' : lang.toUpperCase();

    // Capitalize the voice ID to make it look like a name variant
    const voiceVariant = voiceId
        ? voiceId.toUpperCase()
        : '';

    const label = voiceVariant
        ? `${langLabel} (${regionLabel}) · ${voiceVariant}`
        : `${langLabel} (${regionLabel})`;

    const quality = isNetwork ? 'Enhanced' : isLocal ? 'Local' : '';

    return { label, quality, network: isNetwork };
}

/** The unique key we use to identify/select a voice — voiceURI on Android, name on Web */
function voiceKey(v: VoiceInfo): string {
    return v.voiceURI || v.name;
}

export const AudioSettings = () => {
    const [rate, setRate] = useState(settingsService.getSettings().ttsRate);
    const [availableVoices, setAvailableVoices] = useState<VoiceInfo[]>([]);
    const [profileImage, setProfileImage] = useState<string | null>(null);
    // Use voiceURI as the unique selection key (Android names are non-unique)
    const [selectedVoiceKey, setSelectedVoiceKey] = useState<string | null>(
        settingsService.getSettings().ttsVoice || null
    );
    const [isPreviewing, setIsPreviewing] = useState(false);
    const [previewWordIndex, setPreviewWordIndex] = useState<number | null>(null);
    const isNative = Capacitor.isNativePlatform();

    // Word tokens for the karaoke preview display
    const previewWords = PREVIEW_TEXT.split(/\s+/);

    // Refs for cleanup
    const previewListenerRef = useRef<any>(null);

    // Load voices
    useEffect(() => {
        const updateVoices = () => {
            const voices = audioService.getVoices();
            setAvailableVoices(voices);

            if (voices.length > 0) {
                const savedKey = settingsService.getSettings().ttsVoice;
                // Match by voiceURI first (unique on Android), then by name
                let selected = voices.find(v => voiceKey(v) === savedKey)
                    || voices.find(v => v.name === savedKey);

                if (!selected) {
                    selected = audioService.getBestVoice('female') || voices[0];
                }

                if (selected) {
                    audioService.setSettings({ voiceName: voiceKey(selected) });
                    setSelectedVoiceKey(voiceKey(selected));
                }
            }
        };

        updateVoices();

        // Web: listen for voice list changes
        if (!isNative && typeof window !== 'undefined' && window.speechSynthesis) {
            window.speechSynthesis.onvoiceschanged = updateVoices;
            const timer = setTimeout(updateVoices, 200);
            return () => {
                window.speechSynthesis.onvoiceschanged = null;
                clearTimeout(timer);
            };
        }
    }, []);

    // Load profile image
    useEffect(() => {
        const load = async () => {
            try {
                const { value } = await Preferences.get({ key: 'profileImage' });
                if (value) {
                    setProfileImage(value.startsWith('file://') ? Capacitor.convertFileSrc(value) : value);
                }
            } catch { /* ignore */ }
        };
        load();
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            stopPreview();
        };
    }, []);

    const stopPreview = async () => {
        if (previewListenerRef.current) {
            try { await previewListenerRef.current.remove(); } catch { /* ignore */ }
            previewListenerRef.current = null;
        }
        if (isNative) {
            await TextToSpeech.stop().catch(() => {});
        } else if (typeof window !== 'undefined' && window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }
        setIsPreviewing(false);
        setPreviewWordIndex(null);
    };

    const handlePreview = async () => {
        if (isPreviewing) {
            await stopPreview();
            return;
        }

        setIsPreviewing(true);
        setPreviewWordIndex(null);

        if (isNative) {
            // Native: listen to onRangeStart to highlight words
            // Match by voiceURI (unique) not name (duplicated locale string)
            const voiceIndex = availableVoices.findIndex(v => voiceKey(v) === selectedVoiceKey);

            // Build a char→wordIndex map
            let charOffset = 0;
            const wordMap: Array<{ start: number; end: number; idx: number }> = [];
            previewWords.forEach((word, idx) => {
                const start = PREVIEW_TEXT.indexOf(word, charOffset);
                const end = start + word.length;
                wordMap.push({ start, end, idx });
                charOffset = end;
            });

            previewListenerRef.current = await TextToSpeech.addListener(
                'onRangeStart',
                (data: { start: number; end: number }) => {
                    const entry = wordMap.find(w => w.start === data.start || (data.start >= w.start && data.start < w.end));
                    if (entry) setPreviewWordIndex(entry.idx);
                }
            );

            await TextToSpeech.speak({
                text: PREVIEW_TEXT,
                lang: 'en-US',
                rate: Math.max(0.5, Math.min(2.0, rate)),
                pitch: 1.0,
                volume: 1.0,
                ...(voiceIndex >= 0 ? { voice: voiceIndex } : {}),
            }).catch(() => {});

            await stopPreview();

        } else if (typeof window !== 'undefined' && window.speechSynthesis) {
            // Web: use onboundary
            window.speechSynthesis.cancel();
            const utt = new SpeechSynthesisUtterance(PREVIEW_TEXT);
            utt.rate = rate;
            utt.pitch = 1.0;

            if (selectedVoiceKey) {
                const allWebVoices = window.speechSynthesis.getVoices();
                // Match by voiceURI (unique) first, then by name
                const v = allWebVoices.find(wv => wv.voiceURI === selectedVoiceKey)
                    || allWebVoices.find(wv => wv.name === selectedVoiceKey);
                if (v) utt.voice = v;
            }

            let charOffset = 0;
            const wordMap: Array<{ start: number; end: number; idx: number }> = [];
            previewWords.forEach((word, idx) => {
                const start = PREVIEW_TEXT.indexOf(word, charOffset);
                const end = start + word.length;
                wordMap.push({ start, end, idx });
                charOffset = end;
            });

            utt.onboundary = (e) => {
                if (e.name !== 'word') return;
                const entry = wordMap.find(w => w.start === e.charIndex || (e.charIndex >= w.start && e.charIndex < w.end));
                if (entry) setPreviewWordIndex(entry.idx);
            };
            utt.onend = () => {
                setIsPreviewing(false);
                setPreviewWordIndex(null);
            };
            utt.onerror = () => {
                setIsPreviewing(false);
                setPreviewWordIndex(null);
            };
            window.speechSynthesis.speak(utt);
        }
    };

    const handleVoiceSelect = (voice: VoiceInfo) => {
        const key = voiceKey(voice);
        audioService.setSettings({ voiceName: key });
        setSelectedVoiceKey(key);
        settingsService.updateSettings({ ttsVoice: key });
    };

    const handleRateChange = (newRate: number) => {
        setRate(newRate);
        audioService.setSettings({ rate: newRate });
        settingsService.updateSettings({ ttsRate: newRate });
    };

    const sortedVoices = (() => {
        const userLang = navigator.language.split('-')[0];
        const filtered = availableVoices
            .filter(v => v.lang.startsWith('en') || v.lang.startsWith(userLang));

        // Deduplicate by voiceURI (truly unique on Android)
        const seen = new Set<string>();
        const deduped = filtered.filter(v => {
            const key = voiceKey(v);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        return deduped.sort((a, b) => {
            // Network (enhanced) voices first, then local
            const aNet = a.localService === false;
            const bNet = b.localService === false;
            if (aNet && !bNet) return -1;
            if (!aNet && bNet) return 1;
            // Within same tier, sort by lang then voiceURI
            const langCmp = a.lang.localeCompare(b.lang);
            if (langCmp !== 0) return langCmp;
            return voiceKey(a).localeCompare(voiceKey(b));
        });
    })();

    const rateLabel = rate <= 0.7 ? 'Slow' : rate <= 1.2 ? 'Normal' : rate <= 1.6 ? 'Fast' : 'Very Fast';

    return (
        <div className="bg-[#f8fafc] dark:bg-[#0b0f19] text-slate-900 dark:text-white h-screen overflow-hidden font-sans flex flex-col transition-colors duration-300">
            <Header
                title="AI Audio Reader"
                leftContent={
                    <Link to="/profile" className="flex items-center justify-center p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors">
                        <div className="flex size-9 shrink-0 items-center overflow-hidden rounded-full ring-2 ring-indigo-500/30">
                            {profileImage ? (
                                <img src={profileImage} alt="Profile" className="size-full object-cover" />
                            ) : (
                                <div className="bg-slate-200 dark:bg-slate-800 size-full flex items-center justify-center rounded-full">
                                    <span className="text-lg">👤</span>
                                </div>
                            )}
                        </div>
                    </Link>
                }
                className="border-b border-slate-100 dark:border-white/5 bg-[#f8fafc]/90 dark:bg-[#0b0f19]/90 backdrop-blur-xl"
                transparent
            />

            <div className="flex-1 overflow-y-auto px-5 pb-40 space-y-5">

                {/* ── Karaoke Preview Card ── */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="relative mt-4 rounded-3xl overflow-hidden bg-gradient-to-br from-indigo-500 via-purple-600 to-violet-700 shadow-xl shadow-indigo-500/20"
                >
                    {/* Background decoration */}
                    <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                        <Activity size={130} className="text-white" />
                    </div>

                    <div className="relative z-10 p-5 space-y-4">
                        {/* Badge + Active voice name */}
                        <div>
                            <span className="inline-block px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-white text-[10px] font-bold tracking-widest uppercase mb-3">
                                Active Voice
                            </span>
                            <h2 className="text-xl font-black text-white tracking-tight leading-tight">
                                {selectedVoiceKey
                                    ? prettifyVoiceURI(
                                        selectedVoiceKey,
                                        sortedVoices.find(v => voiceKey(v) === selectedVoiceKey)?.name || selectedVoiceKey
                                      ).label
                                    : 'Select a Voice'}
                            </h2>
                            <p className="text-indigo-100/70 text-xs font-medium mt-0.5">
                                Tap Play to preview with karaoke highlighting
                            </p>
                        </div>

                        {/* Karaoke text display */}
                        <div className="bg-black/20 backdrop-blur-sm rounded-2xl px-4 py-3 min-h-[60px] flex flex-wrap gap-x-1.5 gap-y-1 items-center">
                            {previewWords.map((word, i) => (
                                <AnimatePresence key={i} mode="wait">
                                    <motion.span
                                        className={clsx(
                                            'text-sm font-semibold transition-all duration-100 rounded px-0.5',
                                            previewWordIndex === i
                                                ? 'text-yellow-300 bg-yellow-300/20 scale-110'
                                                : isPreviewing && previewWordIndex !== null && i < previewWordIndex
                                                    ? 'text-white/50'
                                                    : 'text-white/80'
                                        )}
                                        animate={previewWordIndex === i ? { scale: 1.1 } : { scale: 1 }}
                                        transition={{ duration: 0.08 }}
                                    >
                                        {word}
                                    </motion.span>
                                </AnimatePresence>
                            ))}
                        </div>

                        {/* Play / Stop button */}
                        <button
                            onClick={handlePreview}
                            className={clsx(
                                'w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-sm backdrop-blur-md transition-all active:scale-95',
                                isPreviewing
                                    ? 'bg-white/30 text-white border border-white/30'
                                    : 'bg-white text-indigo-600 shadow-lg hover:shadow-xl'
                            )}
                        >
                            {isPreviewing
                                ? <><StopCircle size={18} className="animate-pulse" /> Stop Preview</>
                                : <><Play size={18} className="fill-indigo-600" /> Preview Voice</>
                            }
                        </button>
                    </div>
                </motion.div>

                {/* ── Reading Speed ── */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.08 }}
                    className="bg-white dark:bg-[#151a2a] rounded-3xl p-5 shadow-sm border border-slate-100 dark:border-white/5"
                >
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="size-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
                                <FastForward className="text-violet-500" size={18} />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">Reading Speed</h3>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">{rateLabel} pace</p>
                            </div>
                        </div>
                        <div className="px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-white/10">
                            <span className="text-violet-500 font-black text-sm">{rate.toFixed(1)}x</span>
                        </div>
                    </div>

                    {/* Speed presets */}
                    <div className="flex gap-2 mb-3">
                        {[0.75, 1.0, 1.25, 1.5, 1.75].map(preset => (
                            <button
                                key={preset}
                                onClick={() => handleRateChange(preset)}
                                className={clsx(
                                    'flex-1 py-2 text-[11px] font-bold rounded-xl transition-all',
                                    rate === preset
                                        ? 'bg-violet-500 text-white shadow-md shadow-violet-500/30'
                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                                )}
                            >
                                {preset}x
                            </button>
                        ))}
                    </div>

                    <div className="pt-1">
                        <input
                            className="w-full accent-violet-500 h-2 bg-slate-100 dark:bg-slate-800 rounded-full appearance-none cursor-pointer"
                            type="range"
                            min="0.5" max="2.0" step="0.05"
                            value={rate}
                            onChange={(e) => handleRateChange(parseFloat(e.target.value))}
                        />
                        <div className="flex justify-between mt-2 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                            <span>0.5x</span>
                            <span>1.0x</span>
                            <span>1.5x</span>
                            <span>2.0x</span>
                        </div>
                    </div>
                </motion.div>

                {/* ── Voice Selection ── */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.14 }}
                >
                    <div className="flex items-center justify-between mb-3 px-1">
                        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                            <Mic size={16} className="text-indigo-500" />
                            Available Voices
                        </h3>
                        <div className="flex items-center gap-2">
                            <Volume2 size={12} className="text-slate-400" />
                            <span className="text-[10px] font-bold text-slate-400 bg-slate-200 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                                {sortedVoices.length} Found
                            </span>
                        </div>
                    </div>

                    <div className="space-y-2.5">
                        {sortedVoices.length === 0 ? (
                            <div className="p-6 text-center text-slate-400 text-sm bg-white dark:bg-[#151a2a] rounded-3xl border border-slate-100 dark:border-white/5">
                                {isNative
                                    ? 'Loading voices from your device...'
                                    : 'No voices found. Check your browser TTS settings.'}
                            </div>
                        ) : (
                            sortedVoices.map((v) => {
                                const key = voiceKey(v);
                                const isSelected = selectedVoiceKey === key;
                                // On Android, voiceURI is unique — derive display label from it
                                const { label, quality, network } = prettifyVoiceURI(v.voiceURI || '', v.name);
                                const isEnhanced = network || v.localService === false;

                                return (
                                    <button
                                        key={key}
                                        onClick={() => handleVoiceSelect(v)}
                                        className={clsx(
                                            'w-full flex items-center justify-between p-4 rounded-2xl border transition-all text-left active:scale-[0.98]',
                                            isSelected
                                                ? 'bg-indigo-500/10 border-indigo-500/50 dark:bg-indigo-500/20 shadow-sm'
                                                : 'bg-white dark:bg-[#151a2a] border-slate-100 dark:border-white/5 hover:border-indigo-500/30'
                                        )}
                                    >
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className={clsx('font-bold text-sm', isSelected ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-700 dark:text-slate-300')}>
                                                    {label}
                                                </span>
                                                {isEnhanced ? (
                                                    <span className="bg-gradient-to-r from-violet-500 to-indigo-500 text-white text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded shadow-sm">
                                                        Enhanced
                                                    </span>
                                                ) : (
                                                    <span className="bg-green-500/10 text-green-600 dark:text-green-400 text-[8px] font-bold px-1.5 py-0.5 rounded">
                                                        Offline
                                                    </span>
                                                )}
                                                {quality && quality !== 'Enhanced' && quality !== 'Local' && (
                                                    <span className="bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 text-[8px] font-bold px-1.5 py-0.5 rounded">
                                                        {quality}
                                                    </span>
                                                )}
                                            </div>
                                            <span className="text-[11px] text-slate-400 font-medium">{v.lang}</span>
                                        </div>

                                        <div className={clsx(
                                            'size-5 rounded-full border-2 flex items-center justify-center ml-3 shrink-0 transition-colors',
                                            isSelected ? 'border-indigo-500' : 'border-slate-300 dark:border-slate-600'
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
