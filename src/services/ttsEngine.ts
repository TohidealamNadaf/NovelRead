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
    narration: { rate: 0.98, pitch: 1.0 },   // Calm storytelling
    dialogue: { rate: 1.02, pitch: 1.05 },    // Expressive, slightly faster
    inner: { rate: 0.95, pitch: 0.95 },       // Intimate, slower, lower
    action: { rate: 1.05, pitch: 1.05 },      // Urgent, faster
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
    private isNative: boolean = false; // Forced to false to use Web Speech API for word highlighting

    // User settings
    private baseRate: number = 1.0;
    private basePitch: number = 1.0;
    private webVoice: any | null = null;

    // Callbacks
    private onSegmentChange: SegmentChangeCallback | null = null;
    private onWordChange: ((segment: TTSSegment, charIndex: number, charLength: number) => void) | null = null;
    private onStateChange: StateChangeCallback | null = null;
    private onComplete: (() => void) | null = null;

    constructor() {
        // We enforce web implementation for precise word boundary highlighting
        this.isNative = false; 
        this.setupEventListeners();
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
        onWordChange?: (segment: TTSSegment, charIndex: number, charLength: number) => void;
        onStateChange?: StateChangeCallback;
        onComplete?: () => void;
    }) {
        if (options.onSegmentChange) this.onSegmentChange = options.onSegmentChange;
        if (options.onWordChange) this.onWordChange = options.onWordChange;
        if (options.onStateChange) this.onStateChange = options.onStateChange;
        if (options.onComplete) this.onComplete = options.onComplete;
    }

    /**
     * Set speech settings
     */
    setSettings(options: { rate?: number; pitch?: number; voiceIndex?: number; voice?: any }) {
        if (options.rate !== undefined) this.baseRate = options.rate;
        if (options.pitch !== undefined) this.basePitch = options.pitch;
        
        if (options.voice !== undefined) {
            if (options.voice && typeof window !== 'undefined' && window.speechSynthesis) {
                const webVoices = window.speechSynthesis.getVoices();
                this.webVoice = webVoices.find(v => v.name === options.voice.name) || options.voice;
            } else {
                this.webVoice = options.voice;
            }
        }
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
        let activePromises: Promise<void>[] = [];
        let queuedIndex = this.currentIndex;

        while (queuedIndex < this.segments.length && !this.shouldStop) {
            if (this.isPaused) {
                await this.sleep(200);
                continue;
            }

            // Maintain a buffer of 2 utterances to prevent spin-up latency between sentences
            if (activePromises.length >= 2) {
                await Promise.race(activePromises);
                continue;
            }

            const segment = this.segments[queuedIndex];
            const indexBeingQueued = queuedIndex;
            queuedIndex++;

            const p = this.speakWeb(segment, segment.rate * this.baseRate, segment.pitch * this.basePitch, indexBeingQueued)
                .catch(e => {
                    if (!this.shouldStop && !this.isPaused) {
                        console.error('[TTS] Speak failed:', e);
                    }
                });

            const trackedPromise = p.finally(() => {
                activePromises = activePromises.filter(x => x !== trackedPromise);
            });
            
            activePromises.push(trackedPromise);
        }

        // Wait for all to finish
        while (activePromises.length > 0 && !this.shouldStop) {
            await Promise.race(activePromises);
        }

        if (!this.shouldStop) {
            this.cleanup();
        }
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
     * Web Speech API implementation
     */
    private speakWeb(segment: TTSSegment, rate: number, pitch: number, index?: number): Promise<void> {
        return new Promise((resolve, reject) => {
            if (typeof window === 'undefined' || !window.speechSynthesis) {
                reject(new Error('Speech synthesis not available'));
                return;
            }

            const utterance = new SpeechSynthesisUtterance(segment.text);
            utterance.rate = rate;
            utterance.pitch = pitch;
            if (this.webVoice) {
                utterance.voice = this.webVoice;
            }

            utterance.onstart = () => {
                if (index !== undefined) {
                    this.currentIndex = index;
                }
                this.onSegmentChange?.(segment, segment.id);
            };

            utterance.onend = () => resolve();
            utterance.onerror = (e) => reject(e);
            utterance.onboundary = (e) => {
                if (e.name === 'word') {
                    // e.charIndex is relative to the segment text
                    // e.charLength is provided by some engines, but we can fallback to finding next space
                    let charLength = e.charLength;
                    if (!charLength) {
                        const remaining = segment.text.slice(e.charIndex);
                        const match = remaining.match(/^.*?[\w\u00C0-\u017F]+/);
                        charLength = match ? match[0].length : (remaining.indexOf(' ') > 0 ? remaining.indexOf(' ') : 1);
                    }
                    this.onWordChange?.(segment, e.charIndex, charLength);
                }
            };

            window.speechSynthesis.speak(utterance);
        });
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
