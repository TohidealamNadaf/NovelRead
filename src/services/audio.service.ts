import { settingsService } from './settings.service';
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { Capacitor } from '@capacitor/core';

// Define types
export interface TrackInfo {
    title: string;
    subtitle: string;
    coverUrl?: string;
    isPlaying: boolean;
    type: 'tts' | 'bgm';
}

type Listener = (state: AudioState) => void;

interface AudioState {
    currentTrack: TrackInfo | null;
    isBgmPlaying: boolean;
    isTtsPlaying: boolean;
}

// Voice interface for compatibility
export interface VoiceInfo {
    name: string;
    lang: string;
    localService?: boolean;
    voiceURI?: string;
}

export class AudioService {
    private bgmAudio: HTMLAudioElement | null = null;
    private synthesis: SpeechSynthesis | null = null;
    private utterance: SpeechSynthesisUtterance | null = null;
    private isNative: boolean = false;
    private nativeVoices: VoiceInfo[] = [];
    private isTtsSpeaking: boolean = false;
    private selectedVoice: SpeechSynthesisVoice | null = null;

    // State for persistence/settings
    private pitch: number = 1.0;
    private rate: number = 1.2;
    private selectedVoiceName: string | null = null;
    private ambienceTrack: 'rainy' | 'fireplace' | 'forest' | null = null;

    // Observable State
    private listeners: Listener[] = [];
    private state: AudioState = {
        currentTrack: null,
        isBgmPlaying: false,
        isTtsPlaying: false
    };

    constructor() {
        this.isNative = Capacitor.isNativePlatform();

        if (!this.isNative) {
            // Fallback to Web Speech API for web/browser
            this.synthesis = typeof window !== 'undefined' ? window.speechSynthesis : null;
        }

        // Load persisted settings
        const settings = settingsService.getSettings();
        this.pitch = settings.ttsPitch;
        this.rate = settings.ttsRate;
        this.ambienceTrack = settings.ambience;
        this.selectedVoiceName = settings.ttsVoice || null;

        // Load native voices if on native platform
        if (this.isNative) {
            this.loadVoices();
        }
    }

    async loadVoices() {
        if (!this.isNative) return;

        try {
            const result = await TextToSpeech.getSupportedVoices();
            this.nativeVoices = result.voices || [];
            console.log(`[TTS] Loaded ${this.nativeVoices.length} native voices`);
        } catch (e) {
            console.error('[TTS] Failed to load native voices:', e);
        }
    }

    getVoices(): VoiceInfo[] {
        if (this.isNative) {
            // Retry loading if empty
            if (this.nativeVoices.length === 0) {
                this.loadVoices();
            }
            return this.nativeVoices;
        }
        return this.synthesis ? this.synthesis.getVoices().map(v => ({
            name: v.name,
            lang: v.lang,
            voiceURI: v.voiceURI,
            localService: v.localService
        })) : [];
    }

    // --- State Management ---
    subscribe(listener: Listener) {
        this.listeners.push(listener);
        listener(this.state); // Initial emission
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    private notify() {
        this.listeners.forEach(l => l(this.state));
    }

    private updateState(partial: Partial<TrackInfo> | null) {
        // Update currentTrack
        if (partial === null) {
            this.state.currentTrack = null;
        } else if (this.state.currentTrack) {
            this.state.currentTrack = { ...this.state.currentTrack, ...partial };
        } else if (partial.title) {
            this.state.currentTrack = partial as TrackInfo;
        }

        // Update global flags based on internal state
        this.state.isTtsPlaying = this.synthesis ? (this.synthesis.speaking && !this.synthesis.paused) : false;
        this.state.isBgmPlaying = this.bgmAudio !== null && !this.bgmAudio.paused;

        // Ensure consistency if track says it's playing
        if (this.state.currentTrack) {
            if (this.state.currentTrack.type === 'tts') this.state.isTtsPlaying = this.state.currentTrack.isPlaying;
            if (this.state.currentTrack.type === 'bgm') this.state.isBgmPlaying = this.state.currentTrack.isPlaying;
        }

        this.notify();
    }

    getState() {
        return this.state;
    }

    setSettings(settings: { pitch?: number; rate?: number; voice?: SpeechSynthesisVoice; voiceName?: string }) {
        if (settings.pitch !== undefined) {
            this.pitch = settings.pitch;
            settingsService.updateSettings({ ttsPitch: this.pitch });
        }
        if (settings.rate !== undefined) {
            this.rate = settings.rate;
            settingsService.updateSettings({ ttsRate: this.rate });
        }
        if (settings.voice) {
            this.selectedVoice = settings.voice;
            this.selectedVoiceName = settings.voice.name;
            settingsService.updateSettings({ ttsVoice: settings.voice.name });
        }
        if (settings.voiceName) {
            this.selectedVoiceName = settings.voiceName;
            settingsService.updateSettings({ ttsVoice: settings.voiceName });
        }

        // If currently speaking, apply changes immediately (restart speech)
        if (this.isSpeaking()) {
            const currentText = this.utterance?.text;
            // Retain current track info
            const trackInfo = this.state.currentTrack;
            this.stopSpeaking(false); // Don't clear state yet
            if (currentText) {
                this.speak(currentText, trackInfo?.title, trackInfo?.subtitle, trackInfo?.coverUrl);
            }
        }
    }

    playAmbience(track: 'rainy' | 'fireplace' | 'forest') {
        if (this.ambienceTrack === track && this.bgmAudio && !this.bgmAudio.paused) {
            return; // Already playing
        }

        this.stopBGM();
        this.ambienceTrack = track;
        settingsService.updateSettings({ ambience: track });

        // In a real app, these would be actual files. 
        // For now, we'll just log or use placeholders if available.
        // Using reliable online sources for demo purposes since local files might process incorrectly
        const sources = {
            rainy: 'https://actions.google.com/sounds/v1/weather/rain_heavy_loud.ogg',
            fireplace: 'https://actions.google.com/sounds/v1/ambiences/fireplace.ogg',
            forest: 'https://actions.google.com/sounds/v1/nature/forest_afternoon.ogg'
        };

        this.bgmAudio = new Audio(sources[track]);
        this.bgmAudio.loop = true;
        this.bgmAudio.volume = 0.3;
        this.bgmAudio.play().then(() => {
            this.updateState({
                title: 'Ambience',
                subtitle: track.charAt(0).toUpperCase() + track.slice(1),
                isPlaying: true,
                type: 'bgm'
            });
        }).catch(e => console.log("Ambience play failed", e));
    }

    playBGM(category: 'fantasy' | 'scifi' | 'romance' | 'tense') {
        if (this.bgmAudio && !this.bgmAudio.paused) {
            // If already playing something, maybe we don't restart unless different?
            // For now simple toggle or restart
            this.stopBGM();
        }

        // Using reliable online sources/placeholders
        // Note: In a production app, these should be hosted on your own CDN or assets folder
        const tracks = {
            fantasy: 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=fantasy-orchestral-background-music-113884.mp3', // Fantasy Orchestral
            scifi: 'https://cdn.pixabay.com/download/audio/2022/03/09/audio_c8c8a73467.mp3?filename=sci-fi-cyberpunk-trailer-110587.mp3', // Sci-Fi Cyberpunk
            romance: 'https://cdn.pixabay.com/download/audio/2021/11/01/audio_034a41c22e.mp3?filename=piano-moment-9835.mp3', // Piano Moment
            tense: 'https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0a13f69d2.mp3?filename=suspense-scary-music-13271.mp3' // Suspense
        };

        // Fallback to a placeholder if file doesn't exist in this demo
        const src = tracks[category] || tracks['fantasy'];

        this.bgmAudio = new Audio(src);
        this.bgmAudio.loop = true;
        this.bgmAudio.volume = 0.2;
        this.bgmAudio.play().then(() => {
            this.updateState({
                title: 'Background Music',
                subtitle: category.charAt(0).toUpperCase() + category.slice(1),
                isPlaying: true,
                type: 'bgm'
            });
            // We could store category in settings if we want to persist BGM too
        }).catch(e => console.log("BGM play failed", e));
    }

    getAmbienceTrack() {
        return this.ambienceTrack;
    }

    stopBGM() {
        if (this.bgmAudio) {
            this.bgmAudio.pause();
            this.bgmAudio = null;
            this.ambienceTrack = null;
            settingsService.updateSettings({ ambience: null });
            if (this.state.currentTrack?.type === 'bgm') {
                this.updateState(null); // Clear state if BGM stopped and it was the main track
            }
        }
    }

    async speak(text: string, title?: string, subtitle?: string, coverUrl?: string) {
        const cleanText = text.replace(/<[^>]*>/g, '');

        // Update state first
        this.state.currentTrack = {
            title: title || 'TTS Reading',
            subtitle: subtitle || 'Chapter content',
            coverUrl: coverUrl,
            isPlaying: true,
            type: 'tts'
        };
        this.isTtsSpeaking = true;
        this.notify();

        if (this.isNative) {
            // Use native Capacitor TTS
            try {
                const voiceIndex = this.selectedVoiceName
                    ? this.nativeVoices.findIndex(v => v.name === this.selectedVoiceName)
                    : -1;

                await TextToSpeech.speak({
                    text: cleanText,
                    lang: 'en-US',
                    rate: this.rate,
                    pitch: this.pitch,
                    volume: 1.0,
                    category: 'playback',
                    voice: voiceIndex >= 0 ? voiceIndex : undefined
                });
                // On completion
                this.isTtsSpeaking = false;
                this.updateState({ isPlaying: false });
            } catch (e) {
                console.error('[TTS] Native speak failed:', e);
                this.isTtsSpeaking = false;
                this.updateState({ isPlaying: false });
            }
        } else {
            // Web Speech API fallback
            if (!this.synthesis) {
                console.warn('Speech synthesis not supported on this device');
                return;
            }
            this.stopSpeaking(false);

            this.utterance = new SpeechSynthesisUtterance(cleanText);
            this.utterance.rate = this.rate;
            this.utterance.pitch = this.pitch;
            if (this.selectedVoice) this.utterance.voice = this.selectedVoice;

            this.utterance.onend = () => {
                this.isTtsSpeaking = false;
                this.updateState({ isPlaying: false });
            };

            this.utterance.onpause = () => {
                this.updateState({ isPlaying: false });
            };

            this.utterance.onresume = () => {
                this.updateState({ isPlaying: true });
            };

            this.synthesis.speak(this.utterance);
        }
    }

    pauseSpeaking() {
        if (this.synthesis && this.synthesis.speaking && !this.synthesis.paused) {
            this.synthesis.pause();
            this.updateState({ isPlaying: false });
        }
    }

    resumeSpeaking() {
        if (this.synthesis && this.synthesis.paused) {
            this.synthesis.resume();
            this.updateState({ isPlaying: true });
        }
    }

    isSpeaking(): boolean {
        if (this.isNative) {
            return this.isTtsSpeaking;
        }
        return this.synthesis ? this.synthesis.speaking : false;
    }



    async stopSpeaking(clearState = true) {
        if (this.isNative) {
            try {
                await TextToSpeech.stop();
            } catch (e) {
                console.error('[TTS] Stop failed:', e);
            }
        } else if (this.synthesis) {
            this.synthesis.cancel();
        }

        this.isTtsSpeaking = false;
        if (clearState) {
            this.updateState(null);
        } else {
            this.updateState({ isPlaying: false });
        }
    }

    getBestVoice(gender: 'male' | 'female'): VoiceInfo | null {
        const voices = this.getVoices();
        if (voices.length === 0) return null;

        // Keywords for high quality/natural voices (ranked)
        // 'network' and 'online' usually imply server-side processing which is much better
        const highQuality = ['network', 'online', 'enhanced', 'premium', 'natural', 'google'];

        // Keywords for gender
        const femaleKeywords = ['female', 'zira', 'sira', 'friend', 'girl', 'woman'];
        const maleKeywords = ['male', 'david', 'guy', 'boy', 'man'];

        // Filter by gender first
        const genderVoices = voices.filter(v => {
            const name = v.name.toLowerCase();
            if (gender === 'female') {
                return femaleKeywords.some(k => name.includes(k)) && !maleKeywords.some(k => name.includes(k));
            } else {
                return maleKeywords.some(k => name.includes(k)) && !femaleKeywords.some(k => name.includes(k));
            }
        });

        // If no specific gender match, fallback to all voices to find high quality ones
        const pool = genderVoices.length > 0 ? genderVoices : voices;

        // Sort by quality
        pool.sort((a, b) => {
            const nameA = a.name.toLowerCase();
            const nameB = b.name.toLowerCase();

            // Find highest matching keyword index (lower index = better quality)
            const aQualityIdx = highQuality.findIndex(k => nameA.includes(k));
            const bQualityIdx = highQuality.findIndex(k => nameB.includes(k));

            // If both have keywords, prioritize the one appearing earlier in highQuality list
            if (aQualityIdx !== -1 && bQualityIdx !== -1) {
                return aQualityIdx - bQualityIdx;
            }

            // If only one has keyword, prioritize it
            if (aQualityIdx !== -1) return -1;
            if (bQualityIdx !== -1) return 1;

            return 0;
        });

        // Prefer English if available
        const englishVoice = pool.find(v => v.lang.startsWith('en'));
        return englishVoice || pool[0];
    }

    applyNaturalPreset() {
        this.rate = 1.0; // Slower is more natural
        this.pitch = 1.0; // Neutral pitch
        settingsService.updateSettings({ ttsRate: 1.0, ttsPitch: 1.0 });

        // Find best voices
        const female = this.getBestVoice('female');
        const male = this.getBestVoice('male');

        // Prefer female voice generally for better TTS quality usually
        if (female) {
            this.setSettings({ voice: undefined, voiceName: female.name, rate: 1.0, pitch: 1.0 });
        } else if (male) {
            this.setSettings({ voice: undefined, voiceName: male.name, rate: 1.0, pitch: 1.0 });
        }

        return { rate: 1.0, pitch: 1.0, voice: female || male };
    }
}

export const audioService = new AudioService();
