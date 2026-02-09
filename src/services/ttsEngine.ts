/**
 * TTS Engine - Emotion-Aware Text-to-Speech System
 * 
 * This engine provides human-natural speech by:
 * 1. Segmenting text into narration, dialogue, inner monologue, and action
 * 2. Applying emotion via speech parameters (rate, pitch) per segment type
 * 3. Enabling pause/resume at segment boundaries
 * 4. Tracking current segment for text highlighting
 * 
 * WHY EMOTION IS SIMULATED THIS WAY:
 * - Uses ONLY native OS TTS (no cloud APIs, no API keys, fully offline)
 * - Emotion is conveyed through pacing and pitch variation
 * - No rewriting of text - preserves original author intent
 * 
 * WHY NO CLOUD TTS:
 * - Works offline after system voice pack download
 * - No API costs or rate limits
 * - Safe for Play Store distribution
 * - Fast and lightweight
 */

import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { Capacitor } from '@capacitor/core';

// Segment types for emotion mapping
export type SegmentType = 'narration' | 'dialogue' | 'inner' | 'action';

export interface TTSSegment {
    id: number;
    text: string;
    type: SegmentType;
    rate: number;
    pitch: number;
    startIndex: number;  // For text highlighting in original content
    endIndex: number;
}

// Speech parameters per segment type - tuned for natural audiobook feel
const EMOTION_MAP: Record<SegmentType, { rate: number; pitch: number }> = {
    narration: { rate: 0.95, pitch: 1.0 },   // Calm storytelling
    dialogue: { rate: 1.05, pitch: 1.1 },    // Expressive, slightly faster
    inner: { rate: 0.9, pitch: 0.95 },       // Intimate, slower, lower
    action: { rate: 1.15, pitch: 1.1 },      // Urgent, faster
};

// Keywords for detecting segment types (heuristic, no NLP)
const INNER_KEYWORDS = ['thought', 'felt', 'wondered', 'remembered', 'realized', 'knew', 'believed', 'hoped', 'feared', 'wished'];
const ACTION_VERBS = ['ran', 'jumped', 'struck', 'grabbed', 'slashed', 'dodged', 'threw', 'kicked', 'punched', 'charged', 'leaped', 'crashed', 'exploded', 'sprinted', 'attacked', 'blocked', 'parried'];

type SegmentChangeCallback = (segment: TTSSegment | null, index: number) => void;
type StateChangeCallback = (isPlaying: boolean, isPaused: boolean) => void;

export class TTSEngine {
    private segments: TTSSegment[] = [];
    private currentIndex: number = 0;
    private isPlaying: boolean = false;
    private isPaused: boolean = false;
    private shouldStop: boolean = false;
    private isNative: boolean = false;

    // User settings
    private baseRate: number = 1.0;
    private basePitch: number = 1.0;
    private voiceIndex: number = -1;
    private webVoice: any | null = null;

    // Callbacks
    private onSegmentChange: SegmentChangeCallback | null = null;
    private onStateChange: StateChangeCallback | null = null;
    private onComplete: (() => void) | null = null;

    constructor() {
        this.isNative = Capacitor.isNativePlatform();
    }

    /**
     * Set callbacks for UI updates
     */
    setCallbacks(options: {
        onSegmentChange?: SegmentChangeCallback;
        onStateChange?: StateChangeCallback;
        onComplete?: () => void;
    }) {
        if (options.onSegmentChange) this.onSegmentChange = options.onSegmentChange;
        if (options.onStateChange) this.onStateChange = options.onStateChange;
        if (options.onComplete) this.onComplete = options.onComplete;
    }

    /**
     * Set speech settings
     */
    setSettings(options: { rate?: number; pitch?: number; voiceIndex?: number; voice?: any }) {
        if (options.rate !== undefined) this.baseRate = options.rate;
        if (options.pitch !== undefined) this.basePitch = options.pitch;
        if (options.voiceIndex !== undefined) this.voiceIndex = options.voiceIndex;
        if (options.voice !== undefined) this.webVoice = options.voice;
    }

    /**
     * Segment text into speech chunks with emotion parameters
     */
    segmentText(htmlContent: string): TTSSegment[] {
        // Strip HTML tags
        const text = htmlContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

        const segments: TTSSegment[] = [];
        let id = 0;
        let currentPos = 0;

        // Split into sentences/phrases for natural pauses
        const chunks = this.splitIntoChunks(text);

        for (const chunk of chunks) {
            if (!chunk.trim()) continue;

            const type = this.detectSegmentType(chunk);
            const emotion = EMOTION_MAP[type];

            const startIndex = text.indexOf(chunk, currentPos);
            const endIndex = startIndex + chunk.length;

            segments.push({
                id: id++,
                text: chunk.trim(),
                type,
                rate: emotion.rate,
                pitch: emotion.pitch,
                startIndex,
                endIndex,
            });

            currentPos = endIndex;
        }

        return segments;
    }

    /**
     * Split text into speakable chunks (sentences or dialogue blocks)
     */
    private splitIntoChunks(text: string): string[] {
        const chunks: string[] = [];
        let remaining = text;

        while (remaining.length > 0) {
            // Check for quoted dialogue first
            const dialogueMatch = remaining.match(/^["""]([^"""]+)["""]/);
            if (dialogueMatch) {
                chunks.push(`"${dialogueMatch[1]}"`);
                remaining = remaining.slice(dialogueMatch[0].length).trim();
                continue;
            }

            // Find sentence boundaries
            const sentenceEnd = remaining.search(/[.!?]+(\s|$)/);
            if (sentenceEnd !== -1) {
                const endPos = sentenceEnd + 1;
                chunks.push(remaining.slice(0, endPos).trim());
                remaining = remaining.slice(endPos).trim();
            } else if (remaining.length > 0) {
                // No sentence end found, take remaining
                chunks.push(remaining.trim());
                break;
            }
        }

        return chunks;
    }

    /**
     * Detect segment type using heuristics
     */
    private detectSegmentType(text: string): SegmentType {
        const lowerText = text.toLowerCase();

        // Check for dialogue (quoted text)
        if (/^["""]/.test(text) || /["""]$/.test(text)) {
            return 'dialogue';
        }

        // Check for inner monologue keywords
        for (const keyword of INNER_KEYWORDS) {
            if (lowerText.includes(keyword)) {
                return 'inner';
            }
        }

        // Check for action verbs
        for (const verb of ACTION_VERBS) {
            if (lowerText.includes(verb)) {
                return 'action';
            }
        }

        // Default to narration
        return 'narration';
    }

    /**
     * Start speaking from beginning or resume
     */
    async speak(htmlContent: string, startFromIndex: number = 0): Promise<void> {
        // Parse and segment if starting fresh
        if (startFromIndex === 0 || this.segments.length === 0) {
            this.segments = this.segmentText(htmlContent);
        }

        this.currentIndex = startFromIndex;
        this.isPlaying = true;
        this.isPaused = false;
        this.shouldStop = false;

        this.notifyStateChange();

        await this.speakLoop();
    }

    /**
     * Main speech loop - speaks segments sequentially
     */
    private async speakLoop(): Promise<void> {
        while (this.currentIndex < this.segments.length && !this.shouldStop) {
            if (this.isPaused) {
                // Wait for resume or stop
                await this.sleep(100);
                continue;
            }

            const segment = this.segments[this.currentIndex];

            // Notify UI of current segment for highlighting
            this.onSegmentChange?.(segment, this.currentIndex);

            try {
                await this.speakSegment(segment);
            } catch (e) {
                console.error('[TTS] Segment speak failed:', e);
            }

            // Small pause between segments for natural rhythm
            if (!this.shouldStop && !this.isPaused) {
                await this.sleep(this.getPauseDuration(segment));
            }

            this.currentIndex++;
        }

        // Completed or stopped
        this.isPlaying = false;
        this.isPaused = false;
        this.onSegmentChange?.(null, -1);
        this.notifyStateChange();

        if (!this.shouldStop) {
            this.onComplete?.();
        }
    }

    /**
     * Speak a single segment with emotion parameters
     */
    private async speakSegment(segment: TTSSegment): Promise<void> {
        // Apply user settings on top of emotion settings
        const rate = segment.rate * this.baseRate;
        const pitch = segment.pitch * this.basePitch;

        if (this.isNative) {
            // Use Capacitor TTS for native
            await TextToSpeech.speak({
                text: segment.text,
                lang: 'en-US',
                rate: Math.max(0.5, Math.min(2.0, rate)),
                pitch: Math.max(0.5, Math.min(2.0, pitch)),
                volume: 1.0,
                category: 'playback',
                voice: this.voiceIndex >= 0 ? this.voiceIndex : undefined,
            });
        } else {
            // Web Speech API fallback
            await this.speakWeb(segment.text, rate, pitch);
        }
    }

    /**
     * Web Speech API implementation
     */
    private speakWeb(text: string, rate: number, pitch: number): Promise<void> {
        return new Promise((resolve, reject) => {
            if (typeof window === 'undefined' || !window.speechSynthesis) {
                reject(new Error('Speech synthesis not available'));
                return;
            }

            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = rate;
            utterance.pitch = pitch;
            if (this.webVoice) {
                utterance.voice = this.webVoice;
            }

            utterance.onend = () => resolve();
            utterance.onerror = (e) => reject(e);

            window.speechSynthesis.speak(utterance);
        });
    }

    /**
     * Get pause duration between segments
     */
    private getPauseDuration(segment: TTSSegment): number {
        // Longer pause after dialogue, shorter after action
        if (segment.type === 'dialogue') return 400;
        if (segment.type === 'action') return 150;
        if (segment.type === 'inner') return 350;
        return 250; // Narration
    }

    /**
     * Pause speaking (stops at segment boundary)
     */
    pause(): void {
        if (this.isPlaying && !this.isPaused) {
            this.isPaused = true;
            this.notifyStateChange();

            // Stop current native speech
            if (this.isNative) {
                TextToSpeech.stop().catch(console.error);
            } else if (typeof window !== 'undefined' && window.speechSynthesis) {
                window.speechSynthesis.cancel();
            }
        }
    }

    /**
     * Resume speaking from current position
     */
    async resume(): Promise<void> {
        if (this.isPaused && this.segments.length > 0) {
            this.isPaused = false;
            this.notifyStateChange();
            // Loop will continue automatically
        } else if (!this.isPlaying && this.segments.length > 0) {
            // Restart from current position
            this.isPlaying = true;
            this.isPaused = false;
            this.shouldStop = false;
            this.notifyStateChange();
            await this.speakLoop();
        }
    }

    /**
     * Stop speaking completely
     */
    async stop(): Promise<void> {
        this.shouldStop = true;
        this.isPaused = false;
        this.isPlaying = false;
        this.currentIndex = 0;

        if (this.isNative) {
            await TextToSpeech.stop().catch(console.error);
        } else if (typeof window !== 'undefined' && window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }

        this.onSegmentChange?.(null, -1);
        this.notifyStateChange();
    }

    /**
     * Get current state
     */
    getState() {
        return {
            isPlaying: this.isPlaying,
            isPaused: this.isPaused,
            currentIndex: this.currentIndex,
            totalSegments: this.segments.length,
            currentSegment: this.currentIndex < this.segments.length ? this.segments[this.currentIndex] : null,
        };
    }

    /**
     * Get all segments (for highlighting UI)
     */
    getSegments(): TTSSegment[] {
        return this.segments;
    }

    private notifyStateChange(): void {
        this.onStateChange?.(this.isPlaying, this.isPaused);
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Singleton instance
export const ttsEngine = new TTSEngine();
