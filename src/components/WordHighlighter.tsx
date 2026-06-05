import { useMemo, useEffect, useRef } from 'react';
import { audioService } from '../services/audio.service';

interface WordHighlighterProps {
    /** Raw HTML content from the chapter */
    htmlContent: string;
    /** Extra CSS class applied to the wrapper */
    className?: string;
    /** ID applied to the root element */
    id?: string;
}

/**
 * WordHighlighter
 *
 * Renders chapter text with karaoke-style word-level highlighting.
 *
 * ALGORITHM (same as Google Books / Kindle Assistive Reader):
 * 1. Parse HTML → extract paragraphs preserving structure
 * 2. Split each paragraph into word tokens with their absolute char positions
 * 3. Render each word as a <span> with data-start / data-end attributes
 * 4. On each `activeStart`/`activeEnd` change, find and highlight the matching span
 *
 * This is O(1) per update — React does NOT re-render the word spans.
 * We imperatively toggle a CSS class on the target span element.
 */
export function WordHighlighter({
    htmlContent,
    className = '',
    id,
}: WordHighlighterProps) {
    const rootRef = useRef<HTMLDivElement>(null);
    const activeSpanRef = useRef<HTMLElement | null>(null);

    /**
     * Build the rendered HTML string once.
     * Each word is wrapped in a <span data-s="start" data-e="end">.
     * Paragraphs and inline formatting (<em>, <strong>, <br>, etc.) are preserved.
     */
    const processedHTML = useMemo(() => {
        if (!htmlContent) return '';

        // Parse into a DOM to preserve structure
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlContent, 'text/html');

        let globalCharOffset = 0;

        /**
         * Recursively process a node.
         * Text nodes → split into words, wrap each in a span.
         * Element nodes → recurse into children, preserve tag.
         */
        function processNode(node: Node): string {
            if (node.nodeType === Node.TEXT_NODE) {
                const text = node.textContent || '';
                if (!text.trim()) {
                    globalCharOffset += text.length;
                    return escapeHtml(text);
                }

                // Split text into word+whitespace tokens while tracking positions
                // Regex: one or more non-whitespace chars (a word), or whitespace
                const tokens = text.match(/\S+|\s+/g) || [];
                let result = '';
                for (const token of tokens) {
                    const start = globalCharOffset;
                    const end = start + token.length;
                    globalCharOffset = end;

                    if (/^\s+$/.test(token)) {
                        // Whitespace — render as-is
                        result += escapeHtml(token);
                    } else {
                        // Word — wrap in span with char indices
                        result += `<span class="tts-word" data-s="${start}" data-e="${end}">${escapeHtml(token)}</span>`;
                    }
                }
                return result;

            } else if (node.nodeType === Node.ELEMENT_NODE) {
                const el = node as Element;
                const tag = el.tagName.toLowerCase();

                // Skip script/style nodes
                if (tag === 'script' || tag === 'style') return '';

                // Build attribute string (preserve class, id, etc.)
                const attrs = Array.from(el.attributes)
                    .map(a => `${a.name}="${escapeHtml(a.value)}"`)
                    .join(' ');

                // Void elements
                const voidTags = ['br', 'hr', 'img', 'input', 'meta', 'link'];
                if (voidTags.includes(tag)) {
                    return `<${tag}${attrs ? ' ' + attrs : ''}>`;
                }

                // Recurse
                let inner = '';
                node.childNodes.forEach(child => { inner += processNode(child); });

                return `<${tag}${attrs ? ' ' + attrs : ''}>${inner}</${tag}>`;
            }

            return '';
        }

        let html = '';
        doc.body.childNodes.forEach(node => { html += processNode(node); });
        return html;
    }, [htmlContent]);

    /**
     * Imperatively highlight the active word.
     * We use dataset lookups and a direct audioService subscription rather than 
     * React props/re-renders to achieve true O(1) DOM updates without freezing the UI.
     */
    useEffect(() => {
        if (!rootRef.current) return;

        const unsub = audioService.subscribe((state) => {
            if (!rootRef.current) return;

            const isSpeaking = state.isTtsPlaying && !state.isTtsPaused;
            const activeStart = (isSpeaking && state.wordBoundary) ? state.wordBoundary.start : null;
            const activeEnd = (isSpeaking && state.wordBoundary) ? state.wordBoundary.end : null;

            if (activeStart == null || activeEnd == null) {
                // Remove previous highlight
                if (activeSpanRef.current) {
                    activeSpanRef.current.classList.remove('tts-active-word');
                    activeSpanRef.current = null;
                }
                return;
            }

            // Skip if it's already the active span
            if (activeSpanRef.current && parseInt(activeSpanRef.current.dataset.s || '-1') === activeStart) {
                return;
            }

            // Remove previous highlight
            if (activeSpanRef.current) {
                activeSpanRef.current.classList.remove('tts-active-word');
                activeSpanRef.current = null;
            }

            // Find the span that contains this word range.
            const target = rootRef.current.querySelector<HTMLElement>(
                `[data-s="${activeStart}"]`
            );

        if (target) {
            target.classList.add('tts-active-word');
            activeSpanRef.current = target;

            // Only scroll if the word is getting outside the comfortable viewing area
            const rect = target.getBoundingClientRect();
            const viewportHeight = window.innerHeight;
            if (rect.top < 100 || rect.bottom > viewportHeight - 200) {
                target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        } else {
            // Fallback: find by overlap — the span whose [data-s, data-e] contains activeStart
            const allSpans = rootRef.current.querySelectorAll<HTMLElement>('.tts-word');
            for (const span of allSpans) {
                const s = parseInt(span.dataset.s || '-1', 10);
                const e = parseInt(span.dataset.e || '-1', 10);
                if (s <= activeStart && activeStart < e) {
                    span.classList.add('tts-active-word');
                    activeSpanRef.current = span;
                    const rect = span.getBoundingClientRect();
                    if (rect.top < 100 || rect.bottom > window.innerHeight - 200) {
                        span.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                    break;
                }
            }
        }
        });

        return () => unsub();
    }, []);

    return (
        <div
            ref={rootRef}
            id={id}
            className={className}
            dangerouslySetInnerHTML={{ __html: processedHTML }}
        />
    );
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
