/**
 * RewriterService — AI-powered chapter text correction.
 * 
 * Pipeline:
 *   1. HTML → plain text (preserving inline formatting tags)
 *   2. Deterministic pre-processing (regex fixes for obvious errors)
 *   3. AI correction (spelling, grammar, gender, merged text)
 *   4. Post-processing (strip AI artifacts, normalize)
 *   5. Convert back to HTML paragraphs
 * 
 * Uses Groq → Mistral → OpenRouter → Gemini provider chain.
 */

// ─── Watermark / Ad patterns commonly injected by novel sites ───
const WATERMARK_PATTERNS = [
    /read\s*(this\s*)?(?:novel\s*)?(?:on|at|from)\s*novel\s*fire\.?\s*(?:net|com|org)?/gi,
    /(?:visit|check\s*out|go\s*to)\s*novel\s*fire\.?\s*(?:net|com|org)?/gi,
    /(?:this\s+)?(?:chapter|novel)\s+(?:is\s+)?(?:available|updated)\s+(?:on|at)\s+\S+\.(?:com|net|org)/gi,
    /(?:support\s+us\s+(?:on|at|by)\s+)?\S+\.(?:com|net|org)\s*(?:for\s+more\s+chapters)?/gi,
    /\[?(?:translator|TL|editor|ED|PR|proofreader)\s*(?:note|'s?\s*note)\s*[:：]?\]?\s*[^\n]*/gi,
    /—+\s*(?:Announcement|A\/N|Author'?s?\s*Note)\s*—+[^\n]*/gi,
    /if\s+you\s+(?:want\s+to\s+)?(?:read|see)\s+more\s+chapters[\s\S]{0,80}(?:patreon|ko-?fi|paypal)/gi,
];

// ─── Symbol-substitution typos from fast typing ───
const SYMBOL_TYPO_FIXES: [RegExp, string][] = [
    // @ for a
    [/\b@nd\b/gi, 'and'],
    [/\bw@s\b/gi, 'was'],
    [/\bth@t\b/gi, 'that'],
    [/\b@s\b/gi, 'as'],
    [/\b@t\b/gi, 'at'],
    [/\b@ll\b/gi, 'all'],
    [/\b@re\b/gi, 'are'],
    [/\b@n\b/gi, 'an'],
    [/\b@lso\b/gi, 'also'],
    [/\b@fter\b/gi, 'after'],
    [/\b@lready\b/gi, 'already'],
    [/\b@lways\b/gi, 'always'],
    [/\b@bout\b/gi, 'about'],
    [/\b@bove\b/gi, 'above'],
    [/\bm@n\b/gi, 'man'],
    [/\bm@ke\b/gi, 'make'],
    [/\bm@de\b/gi, 'made'],
    [/\bh@d\b/gi, 'had'],
    [/\bh@ve\b/gi, 'have'],
    [/\bh@s\b/gi, 'has'],
    [/\bc@n\b/gi, 'can'],
    [/\bs@id\b/gi, 'said'],
    [/\bw@nt\b/gi, 'want'],
    [/\bl@st\b/gi, 'last'],
    [/\bp@rt\b/gi, 'part'],
    [/\bb@ck\b/gi, 'back'],
    // $ for s
    [/\b\$he\b/g, 'she'],
    [/\b\$He\b/g, 'She'],
    [/\b\$aid\b/gi, 'said'],
    [/\b\$o\b/gi, 'so'],
    [/\b\$ome\b/gi, 'some'],
    // 0 for o (only in common words)
    [/\b0f\b/g, 'of'],
    [/\b0n\b/g, 'on'],
    [/\b0r\b/g, 'or'],
    [/\bt0\b/g, 'to'],
    [/\bn0t\b/g, 'not'],
    [/\bn0w\b/g, 'now'],
    [/\bg0\b/g, 'go'],
    [/\bg0t\b/g, 'got'],
    [/\bd0\b/g, 'do'],
    // 1 for i/l
    [/\b1t\b/g, 'it'],
    [/\b1n\b/g, 'in'],
    [/\b1s\b/g, 'is'],
    [/\bh1s\b/g, 'his'],
    [/\bth1s\b/g, 'this'],
    [/\bw1th\b/g, 'with'],
    [/\bw1ll\b/g, 'will'],
];

const SYSTEM_PROMPT = `You are a professional novel editor and proofreader. Your ONLY job is to correct errors in the text while preserving the original meaning, tone, and style exactly. You do NOT change the story, add content, or remove content.

Fix these types of errors:
1. GENDER PRONOUN ERRORS: Correct pronouns when they clearly contradict the established gender of a character in context. If a male character is suddenly referred to as "she/her" or vice versa, fix it. Use surrounding context (character names, prior references) to determine correct gender.
2. MERGED TEXT/TITLES: If a chapter title, chapter number, or heading is glued to the first paragraph without any line break (e.g., "Chapter 12: The BattleThe soldiers charged"), separate them with a blank line.
3. SPELLING & TYPO ERRORS: Fix misspelled words, transposed letters, missing letters (e.g., "teh" → "the", "recieve" → "receive", "definately" → "definitely").
4. MERGED/STUCK WORDS: Separate words that are stuck together due to missing spaces (e.g., "inthedark" → "in the dark", "hesaid" → "he said").
5. GRAMMAR: Fix subject-verb agreement, tense inconsistencies within the same paragraph, missing articles, and wrong prepositions.
6. PUNCTUATION: Fix missing periods at end of sentences, wrong comma usage, missing commas in dialogue tags, unbalanced quotation marks.
7. REPEATED WORDS: Remove accidental word repetitions (e.g., "he he said" → "he said", "the the" → "the") but preserve intentional repetitions used for emphasis or stuttering.
8. INCOMPLETE SENTENCES: If a sentence is clearly cut off mid-word or mid-phrase at the end of a paragraph, leave it as-is (it may be intentional cliffhanger style).
9. DIALOGUE FORMATTING: Ensure dialogue has proper opening and closing quotation marks. If dialogue and narration are on the same line with no separation, separate them.

CRITICAL RULES:
- Return ONLY the corrected text. No explanations, notes, preambles, or commentary.
- Do NOT start your response with phrases like "Here is" or "The corrected text".
- Do NOT wrap text in code blocks or markdown formatting.
- Do NOT change character names, place names, skill names, or any fictional/fantasy terms.
- Do NOT rephrase sentences to "sound better" — only fix objective errors.
- Do NOT add new content or remove story content.
- Preserve any inline HTML tags like <i>, <b>, <em>, <strong> exactly as they appear.
- Do NOT add or remove paragraphs, EXCEPT when separating a stuck chapter title/heading.
- Preserve the original paragraph breaks (blank lines between paragraphs).
- If a paragraph has no errors, return it EXACTLY as-is, character for character.`;

const CHUNK_SIZE = 8000; // ~8K chars per chunk to stay within token limits

export class RewriterService {

    private buildPrompt(text: string): string {
        return `Proofread and correct the following novel chapter text. Fix errors including: spelling, grammar, gender pronouns, merged/stuck words, merged titles, repeated words, punctuation, and dialogue formatting. Preserve all inline HTML tags. Return ONLY the corrected text — no commentary, no markdown, no preamble.

Text to correct:
${text}`;
    }

    // ─── DETERMINISTIC PRE-PROCESSING ───
    // Fixes obvious errors locally before the AI sees them.
    // This saves tokens and ensures consistent fixes.

    private preProcess(text: string): string {
        let result = text;

        // 1. Remove watermarks and ad insertions
        for (const pattern of WATERMARK_PATTERNS) {
            result = result.replace(pattern, '');
        }

        // 2. Fix symbol-substitution typos
        for (const [pattern, replacement] of SYMBOL_TYPO_FIXES) {
            result = result.replace(pattern, replacement);
        }

        // 3. Remove exact duplicate consecutive words (case-insensitive)
        //    "the the" → "the", "he he said" → "he said"
        //    But preserve intentional stutters like "no no no" (3+ = intentional)
        result = result.replace(/\b(\w+)\s+\1\b(?!\s+\1)/gi, '$1');

        // 4. Fix missing space after punctuation (but not decimals or URLs)
        //    "said.She" → "said. She", "ran,but" → "ran, but"
        result = result.replace(/([.!?])([A-Z])/g, '$1 $2');
        result = result.replace(/,([A-Za-z])/g, ', $1');
        result = result.replace(/;([A-Za-z])/g, '; $1');
        result = result.replace(/:([A-Za-z])(?!\/\/)/g, ': $1'); // skip URLs

        // 5. Fix multiple consecutive spaces → single space
        result = result.replace(/  +/g, ' ');

        // 6. Fix multiple consecutive periods (not ellipsis)
        //    ".." → ".", "...." → "..."
        result = result.replace(/\.{4,}/g, '...');
        result = result.replace(/(?<!\.)\.\.(?!\.)/g, '.');

        // 7. Remove empty parentheses/brackets left behind
        result = result.replace(/\(\s*\)/g, '');
        result = result.replace(/\[\s*\]/g, '');

        // 8. Fix straight quotes around dialogue if mixed with smart quotes
        //    Normalize to standard double quotes for consistency
        result = result.replace(/[\u201C\u201D]/g, '"');
        result = result.replace(/[\u2018\u2019]/g, "'");

        // 9. Fix lines that are just dashes or underscores (scene separators that got corrupted)
        result = result.replace(/^[\s]*[-_=]{5,}[\s]*$/gm, '\n* * *\n');

        // 10. Trim trailing whitespace on each line
        result = result.replace(/[ \t]+$/gm, '');

        // 11. Collapse 3+ blank lines to 2 (paragraph break)
        result = result.replace(/\n{4,}/g, '\n\n\n');

        return result.trim();
    }

    // ─── POST-PROCESSING ───
    // Cleans up AI output artifacts before converting back to HTML.

    private postProcess(text: string): string {
        let result = text;

        // 1. Strip common AI preambles/commentary
        const preamblePatterns = [
            /^(?:here\s+is|here'?s|below\s+is|the\s+corrected|corrected\s+text|proofread|edited)\s*(?:the\s+)?(?:corrected\s+)?(?:text|version|chapter)?[:\s]*\n*/i,
            /^```(?:text|html)?\s*\n?/,
            /\n?```\s*$/,
            /^\*\*(?:Corrected|Edited|Proofread)\s+(?:Text|Version)\*\*\s*\n*/i,
        ];
        for (const pattern of preamblePatterns) {
            result = result.replace(pattern, '');
        }

        // 2. Strip trailing AI notes/commentary
        const trailingPatterns = [
            /\n+(?:---+|===+)\s*\n*(?:Note|Changes|Corrections|Summary|Edits)[:\s][\s\S]*$/i,
            /\n+\*?\*?(?:Changes\s+made|Corrections\s+made|Edits\s+made|Notes?)[:\s*][\s\S]*$/i,
            /\n+I\s+(?:have\s+)?(?:made|fixed|corrected|changed)[\s\S]*$/i,
        ];
        for (const pattern of trailingPatterns) {
            result = result.replace(pattern, '');
        }

        // 3. Fix multiple consecutive spaces again (AI sometimes introduces them)
        result = result.replace(/  +/g, ' ');

        // 4. Normalize line breaks
        result = result.replace(/\r\n/g, '\n');
        result = result.replace(/\n{4,}/g, '\n\n\n');

        // 5. Trim trailing whitespace on each line
        result = result.replace(/[ \t]+$/gm, '');

        return result.trim();
    }

    /**
     * Split content into chunks by paragraphs, keeping each chunk under CHUNK_SIZE.
     */
    private chunkText(text: string): string[] {
        const paragraphs = text.split(/\n\s*\n/);
        const chunks: string[] = [];
        let current = '';

        for (const para of paragraphs) {
            if (current.length + para.length + 2 > CHUNK_SIZE && current.length > 0) {
                chunks.push(current.trim());
                current = para;
            } else {
                current += (current ? '\n\n' : '') + para;
            }
        }
        if (current.trim()) {
            chunks.push(current.trim());
        }

        return chunks.length > 0 ? chunks : [text];
    }

    /**
     * Strip HTML tags and get plain text, preserving paragraph breaks.
     * Preserves inline formatting tags: i, b, em, strong
     */
    private htmlToText(html: string): string {
        let text = html
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/p>/gi, '\n\n')
            .replace(/<\/div>/gi, '\n\n')
            .replace(/<(?!(\/?(?:i|b|em|strong)(?:\s|>)))[^>]*>/gi, '') // Strip tags EXCEPT i, b, em, strong
            .replace(/&nbsp;/gi, ' ')
            .replace(/&amp;/gi, '&')
            .replace(/&lt;/gi, '<')
            .replace(/&gt;/gi, '>')
            .replace(/&quot;/gi, '"')
            .replace(/&#39;/gi, "'")
            .replace(/&mdash;/gi, '—')
            .replace(/&ndash;/gi, '–')
            .replace(/&hellip;/gi, '...')
            .replace(/&#\d+;/gi, ''); // Strip remaining numeric entities

        // Normalize whitespace but keep paragraph breaks
        text = text.replace(/[ \t]+/g, ' ');
        text = text.replace(/\n{3,}/g, '\n\n');
        return text.trim();
    }

    /**
     * Convert corrected plain text back to HTML paragraphs.
     * Preserves inline tags (i, b, em, strong) within paragraphs.
     */
    private textToHtml(text: string): string {
        return text
            .split(/\n\s*\n/)
            .filter(p => p.trim())
            .map(p => {
                const trimmed = p.trim();
                // If it looks like a chapter heading, wrap in h3
                if (/^(?:Chapter|Ch\.?|CHAPTER)\s+\d+/i.test(trimmed) && trimmed.length < 120) {
                    return `<h3>${trimmed}</h3>`;
                }
                return `<p>${trimmed}</p>`;
            })
            .join('\n');
    }

    // ─── Provider Methods ───

    private async callGroq(prompt: string, apiKey: string): Promise<string> {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.1,
                max_tokens: 8192,
            })
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            console.error('[Rewriter] Groq Error:', response.status, err);
            throw new Error(`Groq API failed with status ${response.status}`);
        }

        const data = await response.json();
        const text = data.choices?.[0]?.message?.content;
        if (!text) throw new Error('Empty response from Groq API');
        return text.trim();
    }

    private async callMistral(prompt: string, apiKey: string): Promise<string> {
        const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: 'open-mistral-nemo',
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.1,
                max_tokens: 8192,
            }),
            signal: AbortSignal.timeout(45000)
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            console.error('[Rewriter] Mistral Error:', response.status, err);
            throw new Error(`Mistral API failed with status ${response.status}`);
        }

        const data = await response.json();
        const text = data.choices?.[0]?.message?.content;
        if (!text) throw new Error('Empty response from Mistral API');
        return text.trim();
    }

    private async callOpenRouter(prompt: string, apiKey: string): Promise<string> {
        const freeModels = [
            'meta-llama/llama-3.3-70b-instruct:free',
            'google/gemma-2-9b-it:free',
            'meta-llama/llama-3.1-8b-instruct:free',
        ];

        let lastError: Error | null = null;

        for (const model of freeModels) {
            try {
                const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`,
                        'HTTP-Referer': 'https://novelnest.app',
                        'X-Title': 'NovelNest Reader',
                    },
                    body: JSON.stringify({
                        model,
                        messages: [
                            { role: 'system', content: SYSTEM_PROMPT },
                            { role: 'user', content: prompt }
                        ],
                        temperature: 0.1,
                        max_tokens: 8192,
                    })
                });

                if (!response.ok) {
                    const err = await response.json().catch(() => ({}));
                    console.warn(`[Rewriter] OpenRouter ${model} failed:`, response.status, err);
                    lastError = new Error(`OpenRouter ${model} failed with status ${response.status}`);
                    continue;
                }

                const data = await response.json();
                const text = data.choices?.[0]?.message?.content;
                if (!text) {
                    lastError = new Error(`Empty response from OpenRouter ${model}`);
                    continue;
                }
                console.log(`[Rewriter] OpenRouter model ${model} succeeded!`);
                return text.trim();
            } catch (e) {
                lastError = e as Error;
            }
        }

        throw lastError || new Error('All OpenRouter free models failed');
    }

    private async callGemini(prompt: string, apiKey: string): Promise<string> {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: `${SYSTEM_PROMPT}\n\n${prompt}` }] }],
                    generationConfig: { temperature: 0.1 },
                    safetySettings: [
                        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
                        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
                        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
                        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
                    ]
                })
            }
        );

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            console.error('[Rewriter] Gemini Error:', response.status, err);
            throw new Error(`Gemini API failed with status ${response.status}`);
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) {
            if (data.candidates?.[0]?.finishReason === 'SAFETY') {
                throw new Error('Content blocked by Gemini safety settings.');
            }
            throw new Error('Empty response from Gemini');
        }
        return text.trim();
    }

    /**
     * Rewrite a single chunk using the provider chain.
     */
    private async rewriteChunk(
        chunk: string,
        providers: { name: string; fn: (prompt: string) => Promise<string> }[]
    ): Promise<string> {
        const prompt = this.buildPrompt(chunk);

        for (const provider of providers) {
            for (let attempt = 0; attempt < 2; attempt++) {
                try {
                    console.log(`[Rewriter] Trying ${provider.name} (attempt ${attempt + 1})...`);
                    const result = await provider.fn(prompt);

                    // Sanity check: if AI returned something way too short or empty, skip
                    if (result.length < chunk.length * 0.3) {
                        console.warn(`[Rewriter] ${provider.name} returned suspiciously short result (${result.length} vs ${chunk.length}), retrying...`);
                        if (attempt === 0) {
                            await new Promise(r => setTimeout(r, 2000));
                            continue;
                        }
                    }

                    console.log(`[Rewriter] ${provider.name} succeeded!`);
                    return result;
                } catch (error) {
                    console.warn(`[Rewriter] ${provider.name} attempt ${attempt + 1} failed:`, error);
                    if (attempt === 0) {
                        await new Promise(r => setTimeout(r, 2000));
                    }
                }
            }
        }

        // If all providers fail, return original chunk unchanged
        console.error('[Rewriter] All providers failed for chunk. Returning original.');
        return chunk;
    }

    /**
     * Main entry point. Rewrites chapter HTML content.
     * Returns corrected HTML string.
     * 
     * Pipeline: HTML → plaintext → pre-process → AI chunks → post-process → HTML
     */
    public async rewriteChapter(
        htmlContent: string,
        geminiApiKey: string,
        groqApiKey?: string | null,
        mistralApiKey?: string | null,
        openRouterApiKey?: string | null,
        onProgress?: (current: number, total: number) => void
    ): Promise<string> {
        // 1. Convert HTML to plain text (preserving inline formatting)
        const plainText = this.htmlToText(htmlContent);

        if (!plainText || plainText.length < 50) {
            return htmlContent; // Too short to rewrite
        }

        // 2. Deterministic pre-processing
        const preProcessed = this.preProcess(plainText);
        console.log(`[Rewriter] Pre-processing: ${plainText.length} → ${preProcessed.length} chars`);

        // 3. Build provider list
        const providers: { name: string; fn: (prompt: string) => Promise<string> }[] = [];

        if (groqApiKey) {
            providers.push({ name: 'Groq', fn: (p) => this.callGroq(p, groqApiKey) });
        }
        if (mistralApiKey) {
            providers.push({ name: 'Mistral', fn: (p) => this.callMistral(p, mistralApiKey) });
        }
        if (openRouterApiKey) {
            providers.push({ name: 'OpenRouter', fn: (p) => this.callOpenRouter(p, openRouterApiKey) });
        }
        if (geminiApiKey) {
            providers.push({ name: 'Gemini', fn: (p) => this.callGemini(p, geminiApiKey) });
        }

        if (providers.length === 0) {
            throw new Error('No API keys configured. Add a Groq, Mistral, OpenRouter, or Gemini key in Settings.');
        }

        // 4. Chunk the text
        const chunks = this.chunkText(preProcessed);
        console.log(`[Rewriter] Processing ${chunks.length} chunk(s)...`);

        // 5. Rewrite each chunk through AI
        const correctedChunks: string[] = [];
        for (let i = 0; i < chunks.length; i++) {
            onProgress?.(i + 1, chunks.length);
            const corrected = await this.rewriteChunk(chunks[i], providers);
            correctedChunks.push(corrected);

            // Small delay between chunks to avoid rate limiting
            if (i < chunks.length - 1) {
                await new Promise(r => setTimeout(r, 1000));
            }
        }

        // 6. Post-process AI output
        const fullCorrectedText = correctedChunks.join('\n\n');
        const postProcessed = this.postProcess(fullCorrectedText);

        // 7. Convert back to HTML
        return this.textToHtml(postProcessed);
    }
}

export const rewriterService = new RewriterService();
