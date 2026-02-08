import { settingsService } from './settings.service';

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

export class AudioService {
    private bgmAudio: HTMLAudioElement | null = null;
    private synthesis: SpeechSynthesis | null = null;
    private utterance: SpeechSynthesisUtterance | null = null;

    // State for persistence/settings
    private pitch: number = 1.0;
    private rate: number = 1.2;
    private selectedVoice: SpeechSynthesisVoice | null = null;
    private ambienceTrack: 'rainy' | 'fireplace' | 'forest' | null = null;

    // Observable State
    private listeners: Listener[] = [];
    private state: AudioState = {
        currentTrack: null,
        isBgmPlaying: false,
        isTtsPlaying: false
    };

    constructor() {
        this.synthesis = typeof window !== 'undefined' ? window.speechSynthesis : null;

        // Load persisted settings
        const settings = settingsService.getSettings();
        this.pitch = settings.ttsPitch;
        this.rate = settings.ttsRate;
        this.ambienceTrack = settings.ambience;
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

    setSettings(settings: { pitch?: number; rate?: number; voice?: SpeechSynthesisVoice }) {
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
            settingsService.updateSettings({ ttsVoice: this.selectedVoice.name });
        }

        // If currently speaking, apply changes immediately (restart speech)
        if (this.isSpeaking()) {
            const currentText = this.utterance?.text;
            // Retain current track info
            const trackInfo = this.state.currentTrack;
            this.stopSpeaking(false); // Don't clear state yet
            if (currentText) {
                // We just need to resume speaking logic, but `speak` takes full text.
                // ideally we would pass metadata again, but for now let's hope `speak` handles it.
                // Better: Just update the properties if possible? No, utterance is immutable for some props once started.
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

    speak(text: string, title?: string, subtitle?: string, coverUrl?: string) {
        if (!this.synthesis) {
            console.warn("Speech synthesis not supported on this device");
            return;
        }
        this.stopSpeaking(false);
        const cleanText = text.replace(/<[^>]*>/g, '');

        this.utterance = new SpeechSynthesisUtterance(cleanText);
        this.utterance.rate = this.rate;
        this.utterance.pitch = this.pitch;
        if (this.selectedVoice) this.utterance.voice = this.selectedVoice;

        this.utterance.onend = () => {
            this.updateState({ isPlaying: false });
        };

        this.utterance.onpause = () => {
            this.updateState({ isPlaying: false });
        };

        this.utterance.onresume = () => {
            this.updateState({ isPlaying: true });
        };

        this.synthesis.speak(this.utterance);

        // Update state
        this.state.currentTrack = {
            title: title || 'TTS Reading',
            subtitle: subtitle || 'Chapter content',
            coverUrl: coverUrl,
            isPlaying: true,
            type: 'tts'
        };
        this.notify();
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

    stopSpeaking(clearState = true) {
        if (this.synthesis) {
            this.synthesis.cancel();
        }
        if (clearState) {
            this.updateState(null);
        } else {
            this.updateState({ isPlaying: false });
        }
    }

    isSpeaking(): boolean {
        return this.synthesis ? this.synthesis.speaking : false;
    }

    getVoices(): SpeechSynthesisVoice[] {
        return this.synthesis ? this.synthesis.getVoices() : [];
    }

    getBestVoice(gender: 'male' | 'female'): SpeechSynthesisVoice | null {
        const voices = this.getVoices();
        if (voices.length === 0) return null;

        // Keywords for high quality/natural voices
        const highQuality = ['natural', 'google', 'enhanced', 'premium', 'online'];

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
            const aQuality = highQuality.some(k => nameA.includes(k));
            const bQuality = highQuality.some(k => nameB.includes(k));
            if (aQuality && !bQuality) return -1;
            if (!aQuality && bQuality) return 1;
            return 0;
        });

        // Prefer English if available
        const englishVoice = pool.find(v => v.lang.startsWith('en'));
        return englishVoice || pool[0];
    }
}

export const audioService = new AudioService();
