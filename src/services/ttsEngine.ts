/**
 * TTS Engine — Optimal Implementation
 *
 * APPROACH (same as Amazon Kindle Assistive Reader & Google Play Books):
 *
 * 1. Pass the FULL plain text to a single speak() call.
 * 2. On Android (native): listen to `onRangeStart` from the Capacitor plugin.
 *    The Android UtteranceProgressListener fires `onRangeStart(start, end)`
 *    with the absolute character indices of the word being spoken.
 * 3. On Web/browser: use Web Speech API `onboundary` for word tracking.
 *
 * This eliminates the complex sentence-chunking that was the root cause of
 * TTS not working on Android (Web Speech API is not available in WebViews).
 *
 * KEY BENEFITS:
 * - Single speak() call = native pause/resume works correctly
 * - onRangeStart gives word-precise char indices → karaoke highlighting
 * - Fully offline, free, uses device's own TTS (Google TTS)
 * - Works on Android 8.1+
 */

import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';

export interface WordBoundary {
    start: number;   // Absolute char index in plain text
    end: number;     // Absolute char end index
    word: string;    // The word being spoken
}

type StateChangeCallback = (isPlaying: boolean, isPaused: boolean) => void;
type WordChangeCallback = (boundary: WordBoundary) => void;
type CompleteCallback = () => void;

export class TTSEngine {
    private isPlaying = false;
    private isPaused = false;
    private shouldStop = false;

    // Whether we're running in a real Capacitor native app (Android/iOS)
    readonly isNative: boolean;

    // Settings
    private baseRate = 1.0;
    private basePitch = 1.0;
    private webVoice: SpeechSynthesisVoice | null = null;
    private nativeVoiceIndex = -1;

    // Native listener handle (for cleanup)
    private nativeRangeListener: PluginListenerHandle | null = null;

    // Web Speech API — current text for resume from current position
    private currentText = '';
    private currentResumeOffset = 0; // char index where we resume from after pause

    // Callbacks
    private onWordChange: WordChangeCallback | null = null;
    private onStateChange: StateChangeCallback | null = null;
    private onComplete: CompleteCallback | null = null;

    constructor() {
        this.isNative = Capacitor.isNativePlatform();
        console.log(`[TTSEngine] Platform: ${this.isNative ? 'NATIVE (Android/iOS)' : 'WEB (browser)'}`);
        this.setupLifecycleListeners();
    }

    private setupLifecycleListeners() {
        // Pause when app goes to background
        App.addListener('appStateChange', ({ isActive }) => {
            if (!isActive && this.isPlaying && !this.isPaused) {
                this.pause();
            }
        });

        // Pause when tab/window hidden
        if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', () => {
                if (document.hidden && this.isPlaying && !this.isPaused) {
                    this.pause();
                }
            });
        }
    }

    // ─── PUBLIC API ──────────────────────────────────────────────────────────

    setCallbacks(options: {
        onWordChange?: WordChangeCallback;
        onStateChange?: StateChangeCallback;
        onComplete?: CompleteCallback;
    }) {
        if (options.onWordChange !== undefined) this.onWordChange = options.onWordChange;
        if (options.onStateChange !== undefined) this.onStateChange = options.onStateChange;
        if (options.onComplete !== undefined) this.onComplete = options.onComplete;
    }

    setSettings(options: {
        rate?: number;
        pitch?: number;
        voice?: any;        // SpeechSynthesisVoice (web) or VoiceInfo (native)
        voiceIndex?: number; // Native voice index
    }) {
        if (options.rate !== undefined) this.baseRate = options.rate;
        if (options.pitch !== undefined) this.basePitch = options.pitch;
        if (options.voiceIndex !== undefined) this.nativeVoiceIndex = options.voiceIndex;

        if (options.voice !== undefined && !this.isNative) {
            // Web: resolve voice object from synthesis API
            if (options.voice && typeof window !== 'undefined' && window.speechSynthesis) {
                const voices = window.speechSynthesis.getVoices();
                this.webVoice = voices.find(v => v.name === options.voice?.name) || options.voice || null;
            } else {
                this.webVoice = options.voice || null;
            }
        }
    }

    /**
     * Speak the given plain text (HTML should be stripped before calling).
     * Resumes from the beginning each time — resuming mid-text is handled separately.
     */
    async speak(plainText: string): Promise<void> {
        // Stop any current speech first
        await this.stop(false); // false = don't clear "shouldStop" so we can restart

        this.currentText = plainText;
        this.currentResumeOffset = 0;
        this.isPlaying = true;
        this.isPaused = false;
        this.shouldStop = false;
        this.notifyState();

        if (this.isNative) {
            await this.speakNative(plainText);
        } else {
            await this.speakWeb(plainText);
        }
    }

    pause(): void {
        if (!this.isPlaying || this.isPaused) return;

        this.isPaused = true;
        this.notifyState();

        if (this.isNative) {
            TextToSpeech.stop().catch(console.error);
        } else if (typeof window !== 'undefined' && window.speechSynthesis) {
            // Record the last spoken position for resume
            // (charIndex of onboundary events track this)
            window.speechSynthesis.pause();
        }
    }

    async resume(): Promise<void> {
        if (!this.isPaused) return;

        this.isPaused = false;
        this.notifyState();

        if (this.isNative) {
            // Android native has no "resume" — re-speak from offset
            const textFromOffset = this.currentText.slice(this.currentResumeOffset);
            await this.speakNative(textFromOffset, this.currentResumeOffset);
        } else if (typeof window !== 'undefined' && window.speechSynthesis) {
            window.speechSynthesis.resume();
        }
    }

    async stop(resetState = true): Promise<void> {
        this.shouldStop = true;
        this.isPlaying = false;
        this.isPaused = false;
        this.currentResumeOffset = 0;

        // Remove native listener
        if (this.nativeRangeListener) {
            await this.nativeRangeListener.remove().catch(() => {});
            this.nativeRangeListener = null;
        }

        if (this.isNative) {
            await TextToSpeech.stop().catch(console.error);
        } else if (typeof window !== 'undefined' && window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }

        if (resetState) {
            this.currentText = '';
            this.onWordChange?.(null as any); // clear highlight
            this.notifyState();
        }
    }

    getState() {
        return { isPlaying: this.isPlaying, isPaused: this.isPaused };
    }

    // ─── NATIVE (Android / iOS) ──────────────────────────────────────────────

    /**
     * Speak via Capacitor TextToSpeech plugin.
     * The plugin's `onRangeStart` listener returns absolute {start, end} indices
     * into the text string passed to speak() — exactly like Kindle/Google Books.
     *
     * @param text         Plain text to speak
     * @param globalOffset Char offset if this is a resume from mid-text
     */
    private async speakNative(text: string, globalOffset = 0): Promise<void> {
        // Clean up any previous listener
        if (this.nativeRangeListener) {
            await this.nativeRangeListener.remove().catch(() => {});
            this.nativeRangeListener = null;
        }

        // Register onRangeStart listener BEFORE calling speak()
        this.nativeRangeListener = await TextToSpeech.addListener(
            'onRangeStart',
            (data: { start: number; end: number; spokenWord: string }) => {
                if (this.shouldStop || this.isPaused) return;

                const absoluteStart = globalOffset + data.start;
                const absoluteEnd = globalOffset + data.end;

                // Track the last spoken position for accurate resume
                this.currentResumeOffset = absoluteStart;

                this.onWordChange?.({
                    start: absoluteStart,
                    end: absoluteEnd,
                    word: data.spokenWord,
                });
            }
        );

        try {
            await TextToSpeech.speak({
                text,
                lang: 'en-US',
                rate: Math.max(0.5, Math.min(2.0, this.baseRate)),
                pitch: Math.max(0.5, Math.min(2.0, this.basePitch)),
                volume: 1.0,
                ...(this.nativeVoiceIndex >= 0 ? { voice: this.nativeVoiceIndex } : {}),
            });

            // speak() resolves when done (or if stop() was called)
            if (!this.shouldStop && !this.isPaused) {
                this.isPlaying = false;
                this.onWordChange?.(null as any); // clear highlight
                this.notifyState();
                this.onComplete?.();
            }
        } catch (e: any) {
            const msg = e?.message || String(e);
            // "interrupted" is expected when stop()/pause() is called
            if (!this.shouldStop && !this.isPaused && !msg.includes('interrupted')) {
                console.error('[TTSEngine-Native] Speak error:', e);
            }
        } finally {
            // Remove listener when speech ends (whether completed or interrupted)
            if (this.nativeRangeListener) {
                await this.nativeRangeListener.remove().catch(() => {});
                this.nativeRangeListener = null;
            }
        }
    }

    // ─── WEB (browser) ──────────────────────────────────────────────────────

    private async speakWeb(text: string): Promise<void> {
        if (typeof window === 'undefined' || !window.speechSynthesis) {
            console.error('[TTSEngine-Web] speechSynthesis not available');
            this.isPlaying = false;
            this.notifyState();
            return;
        }

        return new Promise<void>((resolve) => {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = this.baseRate;
            utterance.pitch = this.basePitch;
            if (this.webVoice) utterance.voice = this.webVoice;

            utterance.onboundary = (e) => {
                if (e.name !== 'word' || this.shouldStop || this.isPaused) return;

                const start = e.charIndex;
                // charLength may be missing in some engines — derive it
                let length = (e as any).charLength;
                if (!length) {
                    const slice = text.slice(start);
                    const nextSpace = slice.search(/\s|$|[.,!?;:]/);
                    length = nextSpace > 0 ? nextSpace : 1;
                }
                const end = start + length;
                this.currentResumeOffset = start;

                this.onWordChange?.({
                    start,
                    end,
                    word: text.slice(start, end),
                });
            };

            utterance.onend = () => {
                if (!this.shouldStop) {
                    this.isPlaying = false;
                    this.onWordChange?.(null as any);
                    this.notifyState();
                    this.onComplete?.();
                }
                resolve();
            };

            utterance.onerror = (e) => {
                if (!this.shouldStop && e.error !== 'interrupted' && e.error !== 'canceled') {
                    console.error('[TTSEngine-Web] Error:', e.error);
                }
                resolve();
            };

            window.speechSynthesis.cancel(); // flush any pending
            window.speechSynthesis.speak(utterance);
        });
    }

    private notifyState(): void {
        this.onStateChange?.(this.isPlaying, this.isPaused);
    }
}

// Singleton instance
export const ttsEngine = new TTSEngine();
