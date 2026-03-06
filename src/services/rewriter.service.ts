/**
 * RewriterService — AI-powered chapter text correction.
 * Fixes spelling, grammar, gender errors, and merged words
 * while preserving the original meaning and story.
 * Uses the same Groq → OpenRouter → Gemini provider chain.
 */

const SYSTEM_PROMPT = `You are a professional novel editor and proofreader. Your ONLY job is to correct errors in the text while preserving the original meaning, tone, and style exactly. You do NOT change the story, add content, or remove content.

Fix ONLY these types of errors:
1. SPELLING MISTAKES (e.g., "teh" → "the", "recieve" → "receive")
2. MERGED/STUCK WORDS (e.g., "andthechief" → "and the chief", "shesaid" → "she said")
3. GENDER ERRORS (e.g., wrong pronouns: "he said" when the character is female → "she said")
4. GRAMMAR ERRORS (e.g., "he go" → "he goes", missing articles)
5. PUNCTUATION ERRORS (e.g., missing periods, wrong commas)

CRITICAL RULES:
- Return ONLY the corrected text. No explanations, notes, or commentary.
- Do NOT change names, places, or fictional terms.
- Do NOT rephrase or rewrite sentences — only fix errors.
- Do NOT add or remove paragraphs. Keep the same paragraph structure.
- Preserve the original paragraph breaks (use blank lines between paragraphs).
- If a paragraph has no errors, return it exactly as-is.`;

const CHUNK_SIZE = 8000; // ~8K chars per chunk to stay within token limits

export class RewriterService {

    private buildPrompt(text: string): string {
        return `Proofread and correct the following novel chapter text. Fix ONLY errors (spelling, grammar, merged words, gender pronouns). Return ONLY the corrected text with the same paragraph structure. Do NOT add commentary or explanations.

Text to correct:
${text}`;
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
     */
    private htmlToText(html: string): string {
        // Replace <p>, <br>, <div> with newlines
        let text = html
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/p>/gi, '\n\n')
            .replace(/<\/div>/gi, '\n\n')
            .replace(/<[^>]*>/g, '') // Strip remaining tags
            .replace(/&nbsp;/gi, ' ')
            .replace(/&amp;/gi, '&')
            .replace(/&lt;/gi, '<')
            .replace(/&gt;/gi, '>')
            .replace(/&quot;/gi, '"')
            .replace(/&#39;/gi, "'");

        // Normalize whitespace but keep paragraph breaks
        text = text.replace(/[ \t]+/g, ' ');
        text = text.replace(/\n{3,}/g, '\n\n');
        return text.trim();
    }

    /**
     * Convert corrected plain text back to HTML paragraphs.
     */
    private textToHtml(text: string): string {
        return text
            .split(/\n\s*\n/)
            .filter(p => p.trim())
            .map(p => `<p>${p.trim()}</p>`)
            .join('\n');
    }

    // --- Provider Methods (same as summarizer) ---

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
                temperature: 0.1, // Very low for minimal creative deviation
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
     */
    public async rewriteChapter(
        htmlContent: string,
        geminiApiKey: string,
        groqApiKey?: string | null,
        mistralApiKey?: string | null,
        openRouterApiKey?: string | null,
        onProgress?: (current: number, total: number) => void
    ): Promise<string> {
        // 1. Convert HTML to plain text
        const plainText = this.htmlToText(htmlContent);

        if (!plainText || plainText.length < 50) {
            return htmlContent; // Too short to rewrite
        }

        // 2. Build provider list
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

        // 3. Chunk the text
        const chunks = this.chunkText(plainText);
        console.log(`[Rewriter] Processing ${chunks.length} chunk(s)...`);

        // 4. Rewrite each chunk
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

        // 5. Reassemble and convert back to HTML
        const fullCorrectedText = correctedChunks.join('\n\n');
        return this.textToHtml(fullCorrectedText);
    }
}

export const rewriterService = new RewriterService();
