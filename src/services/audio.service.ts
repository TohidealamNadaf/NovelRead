import { settingsService } from './settings.service';
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { Capacitor } from '@capacitor/core';
import { ttsEngine } from './ttsEngine';
import type { WordBoundary } from './ttsEngine';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TrackInfo {
    title: string;
    subtitle: string;
    coverUrl?: string;
    isPlaying: boolean;
    type: 'tts' | 'bgm';
}

export interface VoiceInfo {
    name: string;
    lang: string;
    localService?: boolean;
    voiceURI?: string;
}

interface AudioState {
    currentTrack: TrackInfo | null;
    isBgmPlaying: boolean;
    isTtsPlaying: boolean;
    isTtsPaused: boolean;
    /** Active word boundary — char indices into the plain text of the chapter */
    wordBoundary: WordBoundary | null;
}

type Listener = (state: AudioState) => void;

// ─── AudioService ─────────────────────────────────────────────────────────────

export class AudioService {
    private bgmAudio: HTMLAudioElement | null = null;
    private isNative: boolean;
    private nativeVoices: VoiceInfo[] = [];
    private selectedVoice: any = null;
    private silentAudio: HTMLAudioElement | null = null;

    // Settings
    private pitch = 1.0;
    private rate = 1.0;
    private selectedVoiceName: string | null = null;
    private ambienceTrack: 'rainy' | 'fireplace' | 'forest' | null = null;

    // Observable state
    private listeners: Listener[] = [];
    private state: AudioState = {
        currentTrack: null,
        isBgmPlaying: false,
        isTtsPlaying: false,
        isTtsPaused: false,
        wordBoundary: null,
    };

    private sleepTimerId: any = null;

    constructor() {
        this.isNative = Capacitor.isNativePlatform();

        // Silent looping audio to keep the WebView audio session active
        if (typeof window !== 'undefined') {
            this.silentAudio = new Audio(
                'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='
            );
            this.silentAudio.loop = true;
            this.silentAudio.volume = 0.01;
        }

        // Load persisted settings
        const settings = settingsService.getSettings();
        this.pitch = settings.ttsPitch ?? 1.0;
        this.rate = settings.ttsRate ?? 1.0;
        this.ambienceTrack = settings.ambience;
        this.selectedVoiceName = settings.ttsVoice || null;

        // Register engine callbacks
        ttsEngine.setCallbacks({
            onWordChange: (boundary) => {
                this.state.wordBoundary = boundary;
                this.notify();
            },
            onStateChange: (isPlaying, isPaused) => {
                this.state.isTtsPlaying = isPlaying;
                this.state.isTtsPaused = isPaused;
                if (this.state.currentTrack?.type === 'tts') {
                    this.state.currentTrack.isPlaying = isPlaying && !isPaused;
                }

                // BGM ducking
                if (this.bgmAudio) {
                    const vol = settingsService.getSettings().bgmVolume / 100;
                    this.bgmAudio.volume = (isPlaying && !isPaused) ? vol * 0.35 : vol;
                }

                // Keep WebView audio session alive
                if (isPlaying && !isPaused) {
                    this.silentAudio?.play().catch(() => {});
                } else {
                    this.silentAudio?.pause();
                }

                this.notify();
            },
            onComplete: () => {
                this.state.isTtsPlaying = false;
                this.state.isTtsPaused = false;
                this.state.wordBoundary = null;
                if (this.state.currentTrack?.type === 'tts') {
                    this.state.currentTrack.isPlaying = false;
                }

                // Restore BGM volume
                if (this.bgmAudio) {
                    const vol = settingsService.getSettings().bgmVolume / 100;
                    this.bgmAudio.volume = vol;
                }
                this.silentAudio?.pause();
                this.notify();
            },
        });

        // Load voices
        if (this.isNative) {
            this.loadVoices();
        } else {
            // Web: listen for voices to load then set best voice
            const initWebVoice = () => {
                if (!window.speechSynthesis) return;
                const voices = window.speechSynthesis.getVoices();
                if (voices.length === 0) return;

                const savedName = this.selectedVoiceName;
                const match = savedName ? voices.find(v => v.name === savedName) : null;
                const best = match || this.findBestWebVoice(voices);

                if (best) {
                    this.selectedVoice = best;
                    this.selectedVoiceName = best.name;
                    ttsEngine.setSettings({ voice: best });
                }
            };

            if (typeof window !== 'undefined' && window.speechSynthesis) {
                initWebVoice();
                window.speechSynthesis.onvoiceschanged = initWebVoice;
            }
        }
    }

    // ─── Voice Management ────────────────────────────────────────────────────

    async loadVoices(): Promise<void> {
        if (!this.isNative) return;
        try {
            const result = await TextToSpeech.getSupportedVoices();
            this.nativeVoices = result.voices || [];

            if (this.selectedVoiceName) {
                const idx = this.nativeVoices.findIndex(v => v.name === this.selectedVoiceName);
                if (idx !== -1) {
                    this.selectedVoice = this.nativeVoices[idx];
                    ttsEngine.setSettings({ voiceIndex: idx, voice: this.selectedVoice });
                }
            }
        } catch (e) {
            console.error('[Audio] Failed to load voices:', e);
        }
    }

    getVoices(): VoiceInfo[] {
        if (this.isNative) {
            if (this.nativeVoices.length === 0) this.loadVoices();
            return this.nativeVoices;
        }
        if (typeof window === 'undefined' || !window.speechSynthesis) return [];
        return window.speechSynthesis.getVoices().map(v => ({
            name: v.name,
            lang: v.lang,
            voiceURI: v.voiceURI,
            localService: v.localService,
        }));
    }

    getBestVoice(gender: 'male' | 'female'): VoiceInfo | null {
        const voices = this.getVoices();
        if (voices.length === 0) return null;

        const highQuality = ['network', 'online', 'enhanced', 'premium', 'natural', 'google'];
        const femaleKw = ['female', 'zira', 'sira', 'girl', 'woman', 'samantha', 'victoria', 'karen', 'tessa', 'moira', 'veena', 'lexi', 'hazel', 'catherine', 'susi', 'fiona', 'martha', 'google us english'];
        const maleKw = ['male', 'david', 'guy', 'boy', 'man', 'mark', 'arthur', 'george', 'daniel', 'aaron'];

        const genderVoices = voices.filter(v => {
            const n = v.name.toLowerCase();
            return gender === 'female'
                ? femaleKw.some(k => n.includes(k)) && !maleKw.some(k => n.includes(k))
                : maleKw.some(k => n.includes(k)) && !femaleKw.some(k => n.includes(k));
        });

        const pool = genderVoices.length > 0 ? genderVoices : voices;
        pool.sort((a, b) => {
            const ai = highQuality.findIndex(k => a.name.toLowerCase().includes(k));
            const bi = highQuality.findIndex(k => b.name.toLowerCase().includes(k));
            if (ai !== -1 && bi !== -1) return ai - bi;
            if (ai !== -1) return -1;
            if (bi !== -1) return 1;
            return 0;
        });

        return pool.find(v => v.lang.startsWith('en')) || pool[0];
    }

    private findBestWebVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
        const preferred = voices.find(v =>
            v.lang.startsWith('en') &&
            (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Enhanced'))
        );
        return preferred || voices.find(v => v.lang.startsWith('en')) || voices[0];
    }

    // ─── State Management ────────────────────────────────────────────────────

    subscribe(listener: Listener) {
        this.listeners.push(listener);
        listener(this.state);
        return () => { this.listeners = this.listeners.filter(l => l !== listener); };
    }

    private notify() {
        this.listeners.forEach(l => l({ ...this.state }));
    }

    getState() { return this.state; }
    get currentState() { return this.state; }

    // ─── Settings ────────────────────────────────────────────────────────────

    setSettings(settings: { pitch?: number; rate?: number; voice?: any; voiceName?: string }) {
        if (settings.pitch !== undefined) {
            this.pitch = settings.pitch;
            settingsService.updateSettings({ ttsPitch: this.pitch });
        }
        if (settings.rate !== undefined) {
            this.rate = settings.rate;
            settingsService.updateSettings({ ttsRate: this.rate });
            ttsEngine.setSettings({ rate: this.rate });
        }
        if (settings.voice) {
            this.selectedVoice = settings.voice;
            this.selectedVoiceName = settings.voice.name;
            settingsService.updateSettings({ ttsVoice: settings.voice.name });

            if (this.isNative) {
                const idx = this.nativeVoices.findIndex(v => v.name === settings.voice.name);
                ttsEngine.setSettings({ voiceIndex: idx, voice: settings.voice });
            } else {
                ttsEngine.setSettings({ voice: settings.voice });
            }
        } else if (settings.voiceName) {
            this.selectedVoiceName = settings.voiceName;
            settingsService.updateSettings({ ttsVoice: settings.voiceName });

            if (this.isNative) {
                const idx = this.nativeVoices.findIndex(v => v.name === settings.voiceName);
                if (idx !== -1) {
                    this.selectedVoice = this.nativeVoices[idx];
                    ttsEngine.setSettings({ voiceIndex: idx, voice: this.selectedVoice });
                }
            } else if (typeof window !== 'undefined' && window.speechSynthesis) {
                const webVoice = window.speechSynthesis.getVoices().find(v => v.name === settings.voiceName);
                if (webVoice) {
                    this.selectedVoice = webVoice;
                    ttsEngine.setSettings({ voice: webVoice });
                }
            }
        }
    }

    // ─── TTS Controls ────────────────────────────────────────────────────────

    /**
     * Extract plain text from HTML content.
     * Called internally before passing to the TTS engine.
     */
    private htmlToPlainText(html: string): string {
        try {
            const doc = new DOMParser().parseFromString(html, 'text/html');
            return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
        } catch {
            return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        }
    }

    async speak(htmlContent: string, title?: string, subtitle?: string, coverUrl?: string) {
        const plainText = this.htmlToPlainText(htmlContent);
        if (!plainText) return;

        // Duck BGM
        if (this.bgmAudio) {
            const vol = settingsService.getSettings().bgmVolume / 100;
            this.bgmAudio.volume = vol * 0.35;
        }

        // Update track info
        this.state.currentTrack = {
            title: title || 'TTS Reading',
            subtitle: subtitle || 'Chapter content',
            coverUrl,
            isPlaying: true,
            type: 'tts',
        };
        this.state.isTtsPlaying = true;
        this.state.isTtsPaused = false;
        this.state.wordBoundary = null;
        this.notify();

        // Configure engine
        ttsEngine.setSettings({
            rate: this.rate,
            pitch: this.pitch,
            voiceIndex: this.isNative
                ? this.nativeVoices.findIndex(v => v.name === this.selectedVoiceName)
                : -1,
            voice: this.selectedVoice,
        });

        // Speak — engine fires onWordChange / onStateChange / onComplete via callbacks above
        await ttsEngine.speak(plainText);
    }

    async stopSpeaking(clearState = true) {
        if (clearState) {
            this.state.currentTrack = null;
        } else if (this.state.currentTrack) {
            this.state.currentTrack.isPlaying = false;
        }
        this.state.wordBoundary = null;
        this.notify();

        await ttsEngine.stop();
        this.silentAudio?.pause();

        this.state.isTtsPlaying = false;
        this.state.isTtsPaused = false;

        // Restore BGM
        if (this.bgmAudio) {
            const vol = settingsService.getSettings().bgmVolume / 100;
            this.bgmAudio.volume = vol;
        }
        this.notify();
    }

    pause() {
        if (this.state.isTtsPlaying) {
            ttsEngine.pause();
            this.state.isTtsPaused = true;
            this.notify();
        } else if (this.bgmAudio) {
            this.bgmAudio.pause();
            if (this.state.currentTrack) {
                this.state.currentTrack.isPlaying = false;
                this.notify();
            }
        }
    }

    async resume() {
        if (this.state.isTtsPaused) {
            await ttsEngine.resume();
            this.state.isTtsPaused = false;
            this.notify();
        } else if (this.bgmAudio && this.bgmAudio.paused) {
            this.bgmAudio.play().catch(console.error);
            if (this.state.currentTrack) {
                this.state.currentTrack.isPlaying = true;
                this.notify();
            }
        }
    }

    isSpeaking() { return this.state.isTtsPlaying; }
    isPaused() { return this.state.isTtsPaused; }

    // ─── Voice Preview ───────────────────────────────────────────────────────

    async previewVoice(text = 'This is a preview of the selected voice for reading novels.'): Promise<void> {
        if (this.isNative) {
            const voiceIndex = this.selectedVoiceName
                ? this.nativeVoices.findIndex(v => v.name === this.selectedVoiceName)
                : -1;
            await TextToSpeech.speak({
                text,
                lang: 'en-US',
                rate: this.rate,
                pitch: this.pitch,
                volume: 1.0,
                ...(voiceIndex >= 0 ? { voice: voiceIndex } : {}),
            });
        } else if (typeof window !== 'undefined' && window.speechSynthesis) {
            window.speechSynthesis.cancel();
            const utt = new SpeechSynthesisUtterance(text);
            utt.rate = this.rate;
            utt.pitch = this.pitch;
            if (this.selectedVoice) utt.voice = this.selectedVoice;
            window.speechSynthesis.speak(utt);
        }
    }

    // ─── BGM / Ambience ──────────────────────────────────────────────────────

    getAmbienceTrack() { return this.ambienceTrack; }

    playAmbience(track: 'rainy' | 'fireplace' | 'forest') {
        if (this.ambienceTrack === track && this.bgmAudio && !this.bgmAudio.paused) return;
        this.stopBGM();
        this.ambienceTrack = track;
        settingsService.updateSettings({ ambience: track });

        const sources = {
            rainy: 'https://actions.google.com/sounds/v1/weather/rain_heavy_loud.ogg',
            fireplace: 'https://actions.google.com/sounds/v1/ambiences/fireplace.ogg',
            forest: 'https://actions.google.com/sounds/v1/nature/forest_afternoon.ogg',
        };

        this.bgmAudio = new Audio(sources[track]);
        this.bgmAudio.loop = true;
        this.bgmAudio.volume = 0.3;
        this.bgmAudio.play().then(() => {
            this.state.currentTrack = { title: 'Ambience', subtitle: track, isPlaying: true, type: 'bgm' };
            this.state.isBgmPlaying = true;
            this.notify();
        }).catch(console.error);
    }

    playBGM(category: 'fantasy' | 'scifi' | 'romance' | 'tense') {
        this.stopBGM();
        const tracks = {
            fantasy: 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=fantasy-orchestral-background-music-113884.mp3',
            scifi: 'https://cdn.pixabay.com/download/audio/2022/03/09/audio_c8c8a73467.mp3?filename=sci-fi-cyberpunk-trailer-110587.mp3',
            romance: 'https://cdn.pixabay.com/download/audio/2021/11/01/audio_034a41c22e.mp3?filename=piano-moment-9835.mp3',
            tense: 'https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0a13f69d2.mp3?filename=suspense-scary-music-13271.mp3',
        };
        this.bgmAudio = new Audio(tracks[category]);
        this.bgmAudio.loop = true;
        this.bgmAudio.volume = 0.2;
        this.bgmAudio.play().then(() => {
            this.state.currentTrack = { title: 'Background Music', subtitle: category, isPlaying: true, type: 'bgm' };
            this.state.isBgmPlaying = true;
            this.notify();
        }).catch(console.error);
    }

    stopBGM() {
        if (this.bgmAudio) {
            this.bgmAudio.pause();
            this.bgmAudio.currentTime = 0;
            this.bgmAudio = null;
        }
        this.ambienceTrack = null;
        settingsService.updateSettings({ ambience: null });
        if (this.state.currentTrack?.type === 'bgm') this.state.currentTrack = null;
        this.state.isBgmPlaying = false;
        this.notify();
    }

    // ─── Volume Controls ─────────────────────────────────────────────────────

    setVoiceVolume(volume: number) {
        settingsService.updateSettings({ voiceVolume: volume });
    }

    setBgmVolume(volume: number) {
        settingsService.updateSettings({ bgmVolume: volume });
        if (this.bgmAudio) {
            const base = Math.min(1.0, volume / 100);
            this.bgmAudio.volume = this.state.isTtsPlaying ? base * 0.35 : base;
        }
    }

    // ─── Sleep Timer ─────────────────────────────────────────────────────────

    startSleepTimer(minutes: number) {
        this.cancelSleepTimer();
        if (minutes <= 0) { settingsService.updateSettings({ sleepTimer: 0 }); return; }
        settingsService.updateSettings({ sleepTimer: minutes });
        this.sleepTimerId = setTimeout(() => {
            this.stopSpeaking();
            this.stopBGM();
            this.cancelSleepTimer();
            settingsService.updateSettings({ sleepTimer: 0 });
        }, minutes * 60 * 1000);
    }

    cancelSleepTimer() {
        if (this.sleepTimerId) { clearTimeout(this.sleepTimerId); this.sleepTimerId = null; }
    }
}

export const audioService = new AudioService();
