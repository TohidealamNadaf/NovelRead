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

export interface WordBoundary {
    start: number;   // Absolute char index in plain text
    end: number;     // Absolute char end index
    word: string;    // The word being spoken
}

type StateChangeCallback = (isPlaying: boolean, isPaused: boolean) => void;
type WordChangeCallback = (boundary: WordBoundary) => void;
type CompleteCallback = () => void;

export class TTSEngine {
    // TEMP DIAGNOSTIC: counts how many times the native onRangeStart callback
    // fires per spoken word during a single test read. If the listener leak
    // is truly fixed, this should NOT show multiple increments for the same
    // word after several pause/resume cycles. Remove once verified.
    public static rangeStartFireCount = 0;

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
    private nativeVoiceLang = 'en-US';

    // Native listener handle — registered ONCE for the engine's lifetime.
    // Previously this was added/removed on every speak()/resume() call, which
    // could leak native listeners if the plugin's remove() silently failed to
    // fully detach (a known issue with some Capacitor TTS progress listeners).
    // A leaked listener keeps firing on every future word, multiplying CPU/
    // battery/memory cost with every pause-resume cycle. Registering once and
    // reading mutable state inside the callback avoids this entirely.
    private nativeListenerReady: Promise<void> | null = null;

    // Web Speech API — current text for resume from current position
    private currentText = '';
    private currentResumeOffset = 0; // char index where we resume from after pause
    private currentActiveChunkOffset = 0; // offset of the currently speaking chunk (Native)
    private currentUtterance: SpeechSynthesisUtterance | null = null; // Prevent Chrome GC bug

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

        if (options.voice !== undefined) {
            if (options.voice === null) {
                this.webVoice = null;
                this.nativeVoiceLang = 'en-US';
            } else {
                // Save the specific locale of the voice so Android doesn't override it
                if (options.voice.lang) this.nativeVoiceLang = options.voice.lang;
                
                if (!this.isNative) {
                    // Web: resolve voice object from synthesis API
                    if (typeof window !== 'undefined' && window.speechSynthesis) {
                        const voices = window.speechSynthesis.getVoices();
                        const v = options.voice;
                        this.webVoice = voices.find(
                            voice => voice.voiceURI === v.voiceURI || voice.name === v.name
                        ) || null;
                    }
                }
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

        // NOTE: the persistent onRangeStart listener (registered once via
        // ensureNativeListener) is intentionally left attached across stop()
        // calls — it stays idle via the shouldStop/isPaused checks in its
        // callback and will be reused by the next speak() without needing
        // to be re-registered.

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
     * Registers the onRangeStart listener once for the engine's lifetime.
     * Safe to call multiple times — only the first call actually registers.
     * The callback reads live instance state (shouldStop, isPaused,
     * currentActiveChunkOffset) so it stays correct across every speak/resume
     * cycle without ever needing to be re-added or removed.
     */
    private ensureNativeListener(): Promise<void> {
        if (!this.nativeListenerReady) {
            this.nativeListenerReady = TextToSpeech.addListener(
                'onRangeStart',
                (data: { start: number; end: number; spokenWord: string }) => {
                    TTSEngine.rangeStartFireCount++;
                    if (this.shouldStop || this.isPaused) return;

                    const absoluteStart = this.currentActiveChunkOffset + data.start;
                    const absoluteEnd = this.currentActiveChunkOffset + data.end;

                    this.currentResumeOffset = absoluteStart;

                    this.onWordChange?.({
                        start: absoluteStart,
                        end: absoluteEnd,
                        word: data.spokenWord,
                    });
                }
            ).then(() => {
                // handle intentionally discarded since listener lives for engine lifetime
            });
        }
        return this.nativeListenerReady;
    }

    /**
     * Speak via Capacitor TextToSpeech plugin.
     * The plugin's `onRangeStart` listener returns absolute {start, end} indices
     * into the text string passed to speak() — exactly like Kindle/Google Books.
     *
     * @param text         Plain text to speak
     * @param globalOffset Char offset if this is a resume from mid-text
     */
    private async speakNative(text: string, globalOffset = 0): Promise<void> {
        // Ensure the single persistent listener is registered. This no longer
        // adds/removes a listener per call — see ensureNativeListener().
        await this.ensureNativeListener();

        // Chunking for Android's 4000 char limit
        const chunks: { text: string; offset: number }[] = [];
        let remaining = text;
        let currentOffset = globalOffset;

        while (remaining.length > 0) {
            if (remaining.length <= 3500) {
                chunks.push({ text: remaining, offset: currentOffset });
                break;
            }
            
            let breakIndex = 3500;
            const searchSlice = remaining.substring(0, 3500);
            const lastPeriod = searchSlice.lastIndexOf('. ');
            const lastNewline = searchSlice.lastIndexOf('\n');
            const lastSpace = searchSlice.lastIndexOf(' ');

            if (lastPeriod > 0) breakIndex = lastPeriod + 1; 
            else if (lastNewline > 0) breakIndex = lastNewline;
            else if (lastSpace > 0) breakIndex = lastSpace;

            chunks.push({ text: remaining.substring(0, breakIndex), offset: currentOffset });
            currentOffset += breakIndex;
            remaining = remaining.substring(breakIndex);
        }

        try {
            for (let i = 0; i < chunks.length; i++) {
                if (this.shouldStop || this.isPaused) break;
                
                const chunk = chunks[i];
                this.currentActiveChunkOffset = chunk.offset;

                await TextToSpeech.speak({
                    text: chunk.text,
                    lang: this.nativeVoiceLang,
                    rate: Math.max(0.5, Math.min(2.0, this.baseRate)),
                    pitch: Math.max(0.5, Math.min(2.0, this.basePitch)),
                    volume: 1.0,
                    ...(this.nativeVoiceIndex >= 0 ? { voice: this.nativeVoiceIndex } : {}),
                });
            }

            // speak() loop resolves when done (or if stop() was called)
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
        }
        // NOTE: the onRangeStart listener is intentionally NOT removed here.
        // It's a single persistent listener for the engine's lifetime (see
        // ensureNativeListener) and stays safely idle when shouldStop/isPaused
        // are true, since the callback checks those flags and returns early.
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
            this.currentUtterance = utterance; // Prevent GC
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
                if (this.currentUtterance === utterance) this.currentUtterance = null;
                resolve();
            };

            utterance.onerror = (e) => {
                if (!this.shouldStop && e.error !== 'interrupted' && e.error !== 'canceled') {
                    console.error('[TTSEngine-Web] Error:', e.error);
                }
                if (this.currentUtterance === utterance) this.currentUtterance = null;
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
