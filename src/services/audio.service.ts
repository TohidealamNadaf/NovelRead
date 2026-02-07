export class AudioService {
    private bgmAudio: HTMLAudioElement | null = null;
    private synthesis: SpeechSynthesis;
    private utterance: SpeechSynthesisUtterance | null = null;

    // State for persistence/settings
    private pitch: number = 1.0;
    private rate: number = 1.2;
    private selectedVoice: SpeechSynthesisVoice | null = null;
    private ambienceTrack: 'rainy' | 'fireplace' | 'forest' | null = null;

    constructor() {
        this.synthesis = window.speechSynthesis;
    }

    setSettings(settings: { pitch?: number; rate?: number; voice?: SpeechSynthesisVoice }) {
        if (settings.pitch !== undefined) this.pitch = settings.pitch;
        if (settings.rate !== undefined) this.rate = settings.rate;
        if (settings.voice) this.selectedVoice = settings.voice;

        // If currently speaking, apply changes immediately (restart speech)
        if (this.isSpeaking()) {
            const currentText = this.utterance?.text;
            this.stopSpeaking();
            if (currentText) this.speak(currentText);
        }
    }

    playAmbience(track: 'rainy' | 'fireplace' | 'forest') {
        if (this.ambienceTrack === track && this.bgmAudio && !this.bgmAudio.paused) {
            return; // Already playing
        }

        this.stopBGM();
        this.ambienceTrack = track;

        // In a real app, these would be actual files. 
        // For now, we'll just log or use placeholders if available.
        const sources = {
            rainy: '/audio/rain.mp3',
            fireplace: '/audio/fire.mp3',
            forest: '/audio/forest.mp3'
        };

        this.bgmAudio = new Audio(sources[track]);
        this.bgmAudio.loop = true;
        this.bgmAudio.volume = 0.3;
        this.bgmAudio.play().catch(e => console.log("Ambience play failed", e));
    }

    playBGM(category: 'fantasy' | 'scifi' | 'romance' | 'tense') {
        if (this.bgmAudio && !this.bgmAudio.paused) {
            // If already playing something, maybe we don't restart unless different?
            // For now simple toggle or restart
            this.stopBGM();
        }

        const tracks = {
            fantasy: '/audio/fantasy_bgm.mp3',
            scifi: '/audio/scifi_bgm.mp3',
            romance: '/audio/romance_bgm.mp3',
            tense: '/audio/tense_bgm.mp3'
        };

        // Fallback to a placeholder if file doesn't exist in this demo
        const src = tracks[category] || tracks['fantasy'];

        this.bgmAudio = new Audio(src);
        this.bgmAudio.loop = true;
        this.bgmAudio.volume = 0.2;
        this.bgmAudio.play().catch(e => console.log("BGM play failed", e));
    }

    stopBGM() {
        if (this.bgmAudio) {
            this.bgmAudio.pause();
            this.bgmAudio = null;
            this.ambienceTrack = null;
        }
    }

    speak(text: string) {
        this.stopSpeaking();
        const cleanText = text.replace(/<[^>]*>/g, '');

        this.utterance = new SpeechSynthesisUtterance(cleanText);
        this.utterance.rate = this.rate;
        this.utterance.pitch = this.pitch;
        if (this.selectedVoice) this.utterance.voice = this.selectedVoice;

        this.synthesis.speak(this.utterance);
    }

    pauseSpeaking() {
        if (this.synthesis.speaking && !this.synthesis.paused) {
            this.synthesis.pause();
        }
    }

    resumeSpeaking() {
        if (this.synthesis.paused) {
            this.synthesis.resume();
        }
    }

    stopSpeaking() {
        this.synthesis.cancel();
    }

    isSpeaking(): boolean {
        return this.synthesis.speaking;
    }

    getVoices(): SpeechSynthesisVoice[] {
        return this.synthesis.getVoices();
    }
}

export const audioService = new AudioService();
