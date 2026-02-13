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
import { App } from '@capacitor/app';

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
    private language: string = 'en-US';

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
        this.setupEventListeners();
        this.detectLanguage();
    }

    private detectLanguage() {
        if (typeof navigator !== 'undefined' && navigator.language) {
            this.language = navigator.language;
        }
    }

    private setupEventListeners() {
        // Pause on background
        App.addListener('appStateChange', ({ isActive }) => {
            if (!isActive && this.isPlaying && !this.isPaused) {
                console.log('[TTS] App backgrounded, pausing...');
                this.pause();
            }
        });

        // Pause on screen lock / visibility change
        if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', () => {
                if (document.hidden && this.isPlaying && !this.isPaused) {
                    console.log('[TTS] Document hidden, pausing...');
                    this.pause();
                }
            });
        }
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
        // Use DOMParser for safer text extraction
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlContent, 'text/html');
        const text = doc.body.textContent || '';

        // Clean up whitespace but preserve paragraph breaks if needed (though we just take textContent here)
        // For better experience, we might want to process block elements separately, but sticking to text extraction for now
        const cleanText = text.replace(/\s+/g, ' ').trim();

        const segments: TTSSegment[] = [];
        let id = 0;
        let currentPos = 0;

        // Split into sentences/phrases for natural pauses
        const chunks = this.splitIntoChunks(cleanText);

        for (const chunk of chunks) {
            if (!chunk.trim()) continue;

            const type = this.detectSegmentType(chunk);
            const emotion = EMOTION_MAP[type];

            // Note: indexOf might match earlier occurrences. 
            // For rigorous highlighting, we'd need to track position more carefully or use unique IDs in DOM.
            // This is a "good enough" heuristic for now given the constraints.
            const startIndex = cleanText.indexOf(chunk, currentPos);
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
     * Supports smart quotes for better dialogue detection
     */
    private splitIntoChunks(text: string): string[] {
        const chunks: string[] = [];
        let remaining = text;

        // Smart quote pairs: "" “” ‘’
        const quoteRegex = /^["“'‘]([^"”'’]+)["”'’]/;

        while (remaining.length > 0) {
            remaining = remaining.trim();
            if (!remaining) break;

            // Check for quoted dialogue first
            const dialogueMatch = remaining.match(quoteRegex);
            if (dialogueMatch) {
                chunks.push(dialogueMatch[0]);
                remaining = remaining.slice(dialogueMatch[0].length);
                continue;
            }

            // Find sentence boundaries: . ! ? followed by whitespace or end of string
            // We also want to stop at start of quotes to keep dialogue separate
            const sentenceEndMatch = remaining.match(/([.!?]+)(\s|$)|(["“'‘])/);

            if (sentenceEndMatch) {
                if (sentenceEndMatch[3]) {
                    // Found a quote start before end of sentence -> split before quote
                    const splitIndex = sentenceEndMatch.index!;
                    if (splitIndex === 0) {
                        // Should be caught by dialogue match, but safe fallback
                        chunks.push(remaining[0]);
                        remaining = remaining.slice(1);
                    } else {
                        chunks.push(remaining.slice(0, splitIndex).trim());
                        remaining = remaining.slice(splitIndex);
                    }
                } else {
                    // Normal sentence end
                    const endPos = sentenceEndMatch.index! + sentenceEndMatch[0].length;
                    chunks.push(remaining.slice(0, endPos).trim());
                    remaining = remaining.slice(endPos);
                }
            } else {
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
        const trimmed = text.trim();

        // Check for dialogue (quoted text with smart quotes)
        if (
            (/^["“'‘]/.test(trimmed) && /["”'’]$/.test(trimmed)) || // Standard wrapped quotes
            (/^["“]/.test(trimmed) && !/["”]/.test(trimmed)) // Open quote (continuation) - debatable
        ) {
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
     * Main speech loop - speaks segments sequentially with batching
     */
    private async speakLoop(): Promise<void> {
        const BATCH_SIZE = 4; // Target batch size (3-6)

        while (this.currentIndex < this.segments.length && !this.shouldStop) {
            if (this.isPaused) {
                await this.sleep(200);
                continue;
            }

            // Create a batch starting from current index
            const batchStartIndex = this.currentIndex;
            const batchSegments: TTSSegment[] = [];
            let charCount = 0;

            // Collect segments for this batch
            // Logic: Group up to BATCH_SIZE segments, but stop if total length is too long (>500 chars) to avoid huge delays
            for (let i = 0; i < BATCH_SIZE; i++) {
                const idx = batchStartIndex + i;
                if (idx >= this.segments.length) break;

                const segment = this.segments[idx];
                batchSegments.push(segment);
                charCount += segment.text.length;

                if (charCount > 400) break; // Hard limit to prevent long blocking
            }

            // Processing the batch
            if (batchSegments.length === 0) break;

            // Notify UI we are processing this block (highlight first segment)
            // Note: In batched mode, granular highlighting is lost for the duration of the batch
            // We highlight the first one, then maybe estimate updates? 
            // For now, simpler optimization: Notify start of batch
            this.onSegmentChange?.(batchSegments[0], batchStartIndex);

            try {
                if (this.isNative) {
                    // Combine text for native batch call
                    // We use some punctuation hack to ensure pauses between joined segments if needed
                    // Or just join with space if they are sentences
                    const combinedText = batchSegments.map(s => s.text).join(' ');

                    // Use parameters from the first/dominant segment or average?
                    // User req: "Batch 3-6 segments... One native TextToSpeech.speak call"
                    // We'll use the first segment's emotion as the driver for simplicity and consistency within a small block
                    await this.speakNativeBatch(combinedText, batchSegments[0]);
                } else {
                    // Web fallback - speak individually for better control
                    for (const segment of batchSegments) {
                        if (this.shouldStop || this.isPaused) break;
                        this.onSegmentChange?.(segment, segment.id); // Detailed highlighting for web
                        await this.speakWeb(segment.text, segment.rate * this.baseRate, segment.pitch * this.basePitch);
                        await this.sleep(this.getPauseDuration(segment));
                    }
                }
            } catch (e) {
                console.error('[TTS] Batch speak failed:', e);
            }

            // Update index
            this.currentIndex += batchSegments.length;

            // Small pause between batches if needed
            if (!this.shouldStop && !this.isPaused && this.isNative) {
                // Pause based on the last segment of the batch
                const lastSeg = batchSegments[batchSegments.length - 1];
                await this.sleep(this.getPauseDuration(lastSeg));
            }
        }

        // Completed or stopped
        this.cleanup();
    }

    private cleanup() {
        this.isPlaying = false;
        this.isPaused = false;
        this.onSegmentChange?.(null, -1);
        this.notifyStateChange();

        if (!this.shouldStop) {
            this.onComplete?.();
        }

        // Memory cleanup
        if (this.shouldStop) {
            this.segments = []; // Clear segments to free memory
        }
    }

    /**
     * Speak a batch of text natively
     */
    private async speakNativeBatch(text: string, referenceSegment: TTSSegment): Promise<void> {
        // Apply user settings on top of emotion settings
        const rate = referenceSegment.rate * this.baseRate;
        const pitch = referenceSegment.pitch * this.basePitch;

        await TextToSpeech.speak({
            text: text,
            lang: this.language, // Dynamic language
            rate: Math.max(0.5, Math.min(2.0, rate)),
            pitch: Math.max(0.5, Math.min(2.0, pitch)),
            volume: 1.0,
            category: 'playback',
            voice: this.voiceIndex >= 0 ? this.voiceIndex : undefined,
        });
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
        // Heuristic: Check last character for punctuation strength
        const text = segment.text.trim();
        const lastChar = text[text.length - 1];

        let basePause = 250;

        if (segment.type === 'dialogue') basePause = 350;
        else if (segment.type === 'action') basePause = 150;
        else if (segment.type === 'inner') basePause = 300;

        // Punctuation modifiers
        if (['.', '!', '?'].includes(lastChar)) return basePause + 100; // Full stop
        if ([',', ';', ':'].includes(lastChar)) return basePause - 50;  // Comma/clause

        return basePause;
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

        this.cleanup();
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
