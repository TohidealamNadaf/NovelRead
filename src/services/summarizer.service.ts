interface SummaryResult {
    extractive: string;
    events: string[];
    structuredOverview?: { header: string; intro: string; bullets: string[] }[];
}

/**
 * Patterns that indicate an LLM response is an error message or garbage
 * rather than a real chapter summary. Used both inside the service (to
 * reject bad results before returning them) and exported so Reader.tsx's
 * save-guard can reuse the same logic.
 */
const ERROR_PATTERNS = [
    'rate limit',
    'rate_limit',
    'model not found',
    'model_not_found',
    'decommissioned',
    'deprecated',
    'failed to generate',
    'all providers',
    'api key',
    'unauthorized',
    'forbidden',
    'quota exceeded',
    'resource_exhausted',
    'internal server error',
    'service unavailable',
    'bad gateway',
    'too many requests',
    'invalid api key',
    'invalid_api_key',
    'context_length_exceeded',
    'requires an api key',
];

/**
 * Check whether a SummaryResult looks like a genuine chapter summary
 * rather than an error message, garbage output, or suspiciously short stub.
 *
 * @param result          The candidate SummaryResult.
 * @param inputTextLength Length of the original chapter text that was
 *                        submitted for summarization, used to detect
 *                        summaries that are suspiciously short relative
 *                        to their source.
 * @returns true if the result should be treated as valid and cacheable.
 */
export function isValidSummary(result: SummaryResult, inputTextLength: number = 0): boolean {
    if (!result || !result.extractive) return false;

    const lower = result.extractive.toLowerCase();

    // Reject if it contains any known error pattern
    for (const pattern of ERROR_PATTERNS) {
        if (lower.includes(pattern)) return false;
    }

    // Reject if events are empty (a real summary always has at least one event)
    if (!Array.isArray(result.events) || result.events.length === 0) return false;

    // Reject if extractive text is suspiciously short relative to input
    // (a real summary of a 5000+ char chapter should be at least ~80 chars)
    if (inputTextLength > 2000 && result.extractive.length < 60) return false;

    // Reject if events contain error-like strings
    for (const ev of result.events) {
        const evLower = ev.toLowerCase();
        for (const pattern of ERROR_PATTERNS) {
            if (evLower.includes(pattern)) return false;
        }
    }

    return true;
}

export class SummarizerService {
    /**
     * Build the shared prompt for any LLM provider.
     */
    private buildPrompt(chapterTitle: string, safeText: string): string {
        return `You are an expert novel summarizer.
Analyze the following chapter content titled "${chapterTitle}".
Match the tone, mood, and atmosphere of the original text (e.g., if the chapter is dark and intense, the summary should be as well; if it's light and humorous, mirror that style).
Return a strict JSON object with THREE keys:
1. "structuredOverview": An array of section objects representing the summary. Each object must have:
   - "header": A thematic, descriptive title for the section (can be numbered, e.g., "1. The Chu Clan's Political Situation").
   - "intro": A short introductory paragraph for the section (optional, can be empty if bullets suffice).
   - "bullets": An array of strings providing a highly detailed, comprehensive breakdown of the events in this section.
CRITICAL INSTRUCTION: Ensure the summary is comprehensive and captures all plot points, political nuances, character interactions, and setting details. Do NOT artificially limit the number of sections or bullet points; use as many as needed to fully summarize the chapter.
2. "extractive": A brief fallback paragraph summarizing the overall chapter.
3. "events": An array of strings, where each string is a clear bullet point of a key action, revelation, or event that occurred in the chapter. (No hard limit, capture all major events)

Output ONLY valid JSON. Do not use Markdown formatting for the JSON block itself.

Chapter Content:
${safeText}`;
    }

    /**
     * Attempts to repair truncated or slightly malformed JSON strings
     * generated when an LLM response hits max_tokens cutoff.
     */
    private repairTruncatedJson(jsonString: string): string {
        let str = jsonString.trim();

        let inString = false;
        let isEscaped = false;
        for (let i = 0; i < str.length; i++) {
            const char = str[i];
            if (char === '\\' && !isEscaped) {
                isEscaped = true;
            } else {
                if (char === '"' && !isEscaped) {
                    inString = !inString;
                }
                isEscaped = false;
            }
        }

        if (inString) {
            str += '"';
        }

        const stack: string[] = [];
        inString = false;
        isEscaped = false;

        for (let i = 0; i < str.length; i++) {
            const char = str[i];
            if (char === '\\' && !isEscaped) {
                isEscaped = true;
                continue;
            }
            if (char === '"' && !isEscaped) {
                inString = !inString;
            } else if (!inString) {
                if (char === '{' || char === '[') {
                    stack.push(char);
                } else if (char === '}') {
                    if (stack[stack.length - 1] === '{') stack.pop();
                } else if (char === ']') {
                    if (stack[stack.length - 1] === '[') stack.pop();
                }
            }
            isEscaped = false;
        }

        while (stack.length > 0) {
            const open = stack.pop();
            if (open === '{') str += '}';
            else if (open === '[') str += ']';
        }

        return str;
    }

    /**
     * Parse the raw LLM text response into a SummaryResult.
     * Safely handles truncated JSON by attempting repair and regex extraction.
     */
    private parseResponse(rawText: string): SummaryResult {
        const cleaned = rawText.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
        let parsed: any;

        try {
            parsed = JSON.parse(cleaned);
        } catch (e) {
            try {
                const repaired = this.repairTruncatedJson(cleaned);
                parsed = JSON.parse(repaired);
                console.log('[Summarizer] Successfully recovered truncated JSON response!');
            } catch (repairError) {
                console.warn('[Summarizer] JSON repair failed, attempting regex fallback:', repairError);
                const extractiveMatch = cleaned.match(/"extractive"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);
                const eventsMatch = cleaned.match(/"events"\s*:\s*\[([\s\S]*?)\]/);
                
                let events: string[] = [];
                if (eventsMatch && eventsMatch[1]) {
                    const eventMatches = eventsMatch[1].match(/"([^"\\]*(?:\\.[^"\\]*)*)"/g);
                    if (eventMatches) {
                        events = eventMatches.map(m => m.replace(/^"|"$/g, '').replace(/\\"/g, '"'));
                    }
                }
                
                if (extractiveMatch || events.length > 0) {
                    parsed = {
                        extractive: extractiveMatch ? extractiveMatch[1].replace(/\\"/g, '"') : "Summary generated.",
                        events
                    };
                } else {
                    throw e;
                }
            }
        }

        return {
            extractive: parsed.extractive || "Unable to extract summary.",
            events: Array.isArray(parsed.events) ? parsed.events : [],
            structuredOverview: Array.isArray(parsed.structuredOverview) ? parsed.structuredOverview : undefined
        };
    }

    /**
     * Try Groq API (Llama 4 Scout 17B with fallback models — free tier: 30 RPM).
     */
    private async tryGroq(prompt: string, apiKey: string): Promise<SummaryResult> {
        const models = [
            'llama-3.1-8b-instant',      // #1 Official Groq production free model
            'llama-3.3-70b-versatile',   // #2 Groq 70B production model
            'gemma2-9b-it',              // #3 Groq Gemma 2 model
            'mixtral-8x7b-32768'         // #4 Groq Mixtral model
        ];

        let lastErr: any = null;
        for (const model of models) {
            try {
                const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify({
                        model,
                        messages: [
                            { role: 'system', content: 'You are an expert novel summarizer. Always respond with valid JSON only.' },
                            { role: 'user', content: prompt }
                        ],
                        temperature: 0.3,
                        max_tokens: 2048,
                        response_format: { type: 'json_object' }
                    })
                });

                if (!response.ok) {
                    const err = await response.json().catch(() => ({}));
                    console.error(`[Summarizer] Groq API Error (${model}):`, response.status, err);
                    const error: any = new Error(`Groq API (${model}) failed with status ${response.status}`);
                    if (response.status === 401 || response.status === 403) {
                        error.isAuthError = true;
                        throw error; // Auth failure will fail fast for all models
                    }
                    if (response.status === 413) {
                        error.isPayloadTooLarge = true;
                    }
                    lastErr = error;
                    continue;
                }

                const data = await response.json();
                const text = data.choices?.[0]?.message?.content;
                if (!text) {
                    lastErr = new Error(`Empty response from Groq model ${model}`);
                    continue;
                }
                return this.parseResponse(text);
            } catch (e: any) {
                if (e?.isAuthError) throw e;
                lastErr = e;
            }
        }

        throw lastErr || new Error('All Groq models failed');
    }

    /**
     * Try OpenRouter API — walks a fallback chain of free models.
     *
     * The chain is led by `openrouter/free`, a meta-router that dynamically
     * selects among whatever free models are currently live. The named models
     * behind it are a manually-curated backstop for when the meta-router's
     * pick underperforms or fails outright.
     */
    private async tryOpenRouter(prompt: string, apiKey: string): Promise<SummaryResult> {
        const OPENROUTER_FALLBACK_CHAIN = [
            'openrouter/free',                     // meta-router — dynamically picks best available free model
            'google/gemma-2-9b-it:free',           // fast MoE, good default quality/speed
            'meta-llama/llama-3.1-8b-instruct:free',// solid general-purpose fallback
            'qwen/qwen-2.5-72b-instruct:free',     // strong reasoning
            'mistralai/mistral-7b-instruct:free',  // reliable fallback
        ];

        let lastError: any = null;

        for (const model of OPENROUTER_FALLBACK_CHAIN) {
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
                            { role: 'system', content: 'You are an expert novel summarizer. Always respond with valid JSON only.' },
                            { role: 'user', content: prompt }
                        ],
                        temperature: 0.3,
                        max_tokens: 4096,
                    })
                });

                if (!response.ok) {
                    const err = await response.json().catch(() => ({}));
                    console.warn(`[Summarizer] OpenRouter model ${model} failed:`, response.status, err);
                    const error: any = new Error(`OpenRouter ${model} failed with status ${response.status}`);
                    if (response.status === 401 || response.status === 403) {
                        error.isAuthError = true;
                        throw error; // Auth failure will fail fast for all OpenRouter models
                    }
                    lastError = error;
                    continue;
                }

                const data = await response.json();
                const text = data.choices?.[0]?.message?.content;
                if (!text) {
                    lastError = new Error(`Empty response from OpenRouter ${model}`);
                    continue;
                }

                // Validate that the response parses as a real summary, not
                // an error message or garbage from a silently-broken model.
                try {
                    const result = this.parseResponse(text);
                    if (!isValidSummary(result)) {
                        console.warn(`[Summarizer] OpenRouter model ${model} returned invalid/garbage summary, skipping`);
                        lastError = new Error(`OpenRouter ${model} returned invalid summary content`);
                        continue;
                    }
                    console.log(`[Summarizer] OpenRouter model ${model} succeeded!`);
                    return result;
                } catch (parseErr) {
                    console.warn(`[Summarizer] OpenRouter model ${model} returned unparseable response:`, parseErr);
                    lastError = parseErr as Error;
                    continue;
                }
            } catch (e) {
                lastError = e as Error;
                console.warn(`[Summarizer] OpenRouter model ${model} error:`, e);
            }
        }

        throw lastError || new Error('All OpenRouter free models failed');
    }

    /**
     * Try Gemini API (gemini-1.5-flash & gemini-2.5-flash — Google AI Studio free tier: 15 RPM, 1M context).
     */
    private async tryGemini(prompt: string, apiKey: string): Promise<SummaryResult> {
        const models = ['gemini-2.5-flash', 'gemini-3.5-flash', 'gemini-3.6-flash'];
        let lastErr: any = null;

        for (const model of models) {
            try {
                const response = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents: [{ parts: [{ text: prompt }] }],
                            generationConfig: {
                                temperature: 0.3,
                                responseMimeType: 'application/json',
                            },
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
                    console.error(`[Summarizer] Gemini API Error (${model}):`, response.status, err);
                    const error: any = new Error(`Gemini API (${model}) failed with status ${response.status}`);
                    if (response.status === 400 && JSON.stringify(err).toLowerCase().includes('api_key')) {
                        error.isAuthError = true;
                        throw error;
                    }
                    if (response.status === 401 || response.status === 403) {
                        error.isAuthError = true;
                        throw error;
                    }
                    lastErr = error;
                    continue;
                }

                const data = await response.json();
                const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
                if (!text) {
                    if (data.candidates?.[0]?.finishReason === 'SAFETY') {
                        lastErr = new Error(`Content blocked by Gemini (${model}) safety settings.`);
                        continue;
                    }
                    lastErr = new Error(`Empty response from Gemini API (${model})`);
                    continue;
                }
                return this.parseResponse(text);
            } catch (e: any) {
                if (e?.isAuthError) throw e;
                lastErr = e;
            }
        }

        throw lastErr || new Error('All Gemini models failed');
    }

    /**
     * Try Mistral API (mistral-small-latest — free experiment tier).
     * Model updated 2026-08-17: open-mistral-nemo was retired Jul 31 2026.
     */
    private async tryMistral(prompt: string, apiKey: string): Promise<SummaryResult> {
        const models = ['mistral-small-latest', 'open-mistral-7b', 'mistral-medium-latest'];
        let lastErr: any = null;

        for (const model of models) {
            try {
                const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify({
                        model,
                        messages: [
                            { role: 'system', content: 'You are an expert novel summarizer. Always respond with valid JSON only.' },
                            { role: 'user', content: prompt }
                        ],
                        temperature: 0.3,
                        max_tokens: 4096,
                        response_format: { type: 'json_object' }
                    }),
                    signal: AbortSignal.timeout(45000)
                });

                if (!response.ok) {
                    const err = await response.json().catch(() => ({}));
                    console.error(`[Summarizer] Mistral API Error (${model}):`, response.status, err);
                    const error: any = new Error(`Mistral API (${model}) failed with status ${response.status}`);
                    if (response.status === 401 || response.status === 403) {
                        error.isAuthError = true;
                        throw error;
                    }
                    lastErr = error;
                    continue;
                }

                const data = await response.json();
                const text = data.choices?.[0]?.message?.content;
                if (!text) {
                    lastErr = new Error(`Empty response from Mistral model ${model}`);
                    continue;
                }
                return this.parseResponse(text);
            } catch (e: any) {
                if (e?.isAuthError) throw e;
                lastErr = e;
            }
        }

        throw lastErr || new Error('All Mistral models failed');
    }

    /**
     * Main entry point. Tries providers in order with automatic fallback.
     * Provider priority: Groq → Mistral → OpenRouter → Gemini.
     *
     * Every result is validated through isValidSummary() before being
     * returned, so a silently-broken model that returns garbage or error
     * text will be treated the same as a network failure — the chain
     * continues to the next provider.
     */
    public async generateSummary(
        chapterTitle: string,
        text: string,
        geminiApiKey: string,
        groqApiKey?: string | null,
        mistralApiKey?: string | null,
        openRouterApiKey?: string | null,
        providerPriority: string[] = ['groq', 'mistral', 'openrouter', 'gemini']
    ): Promise<SummaryResult> {
        // Fallback for extremely short texts
        if (!text || text.length < 200) {
            return { extractive: text || "", events: [] };
        }

        // Clean and truncate safely for LLM payload & TPM limits (12,000 chars max)
        const cleanText = text.replace(/\s+/g, ' ').trim();
        let safeText = cleanText;
        if (cleanText.length > 12000) {
            const head = cleanText.substring(0, 6000);
            const tail = cleanText.substring(cleanText.length - 6000);
            safeText = `${head}\n\n[... middle section omitted for length ...]\n\n${tail}`;
        }
        const prompt = this.buildPrompt(chapterTitle, safeText);
        const inputLength = safeText.length;

        // Map configured API keys to provider runners
        const availableMap: Record<string, { name: string; fn: () => Promise<SummaryResult> }> = {};

        if (groqApiKey) {
            availableMap['groq'] = { name: 'Groq', fn: () => this.tryGroq(prompt, groqApiKey) };
        }
        if (mistralApiKey) {
            availableMap['mistral'] = { name: 'Mistral', fn: () => this.tryMistral(prompt, mistralApiKey) };
        }
        if (openRouterApiKey) {
            availableMap['openrouter'] = { name: 'OpenRouter', fn: () => this.tryOpenRouter(prompt, openRouterApiKey) };
        }
        if (geminiApiKey) {
            availableMap['gemini'] = { name: 'Gemini', fn: () => this.tryGemini(prompt, geminiApiKey) };
        }

        // Order providers strictly by user-defined priority
        const providers: { name: string; fn: () => Promise<SummaryResult> }[] = [];
        for (const id of providerPriority) {
            const key = id.toLowerCase();
            if (availableMap[key]) {
                providers.push(availableMap[key]);
            }
        }
        // Include any remaining configured providers not in priority array
        for (const key of Object.keys(availableMap)) {
            if (!providers.some(p => p.name.toLowerCase() === key)) {
                providers.push(availableMap[key]);
            }
        }

        if (providers.length > 0) {
            console.log('[Summarizer] Running provider fallback chain in user sequence:', providers.map(p => p.name).join(' → '));
        }

        if (providers.length === 0) {
            return {
                extractive: "AI Summarization requires an API key. Add a free Groq, Mistral, OpenRouter, or Gemini API key in Settings.",
                events: [
                    "Open the app Settings",
                    "Scroll down to Advanced",
                    "Get a free API key from Groq, Mistral, OpenRouter, or Google AI Studio."
                ]
            };
        }

        // Try each provider in order with one retry per provider
        for (const provider of providers) {
            for (let attempt = 0; attempt < 2; attempt++) {
                try {
                    console.log(`[Summarizer] Trying ${provider.name} (attempt ${attempt + 1})...`);
                    const result = await provider.fn();

                    // Validate that the result is a real summary, not garbage
                    if (!isValidSummary(result, inputLength)) {
                        console.warn(`[Summarizer] ${provider.name} returned invalid/garbage summary, treating as failure`);
                        throw new Error(`${provider.name} returned invalid summary content`);
                    }

                    console.log(`[Summarizer] ${provider.name} succeeded!`);
                    return result;
                } catch (error: any) {
                    console.warn(`[Summarizer] ${provider.name} attempt ${attempt + 1} failed:`, error);
                    if (error?.isAuthError) {
                        console.warn(`[Summarizer] ${provider.name} key is invalid (401/403). Skipping retries.`);
                        break;
                    }
                    if (attempt === 0) {
                        await new Promise(r => setTimeout(r, 3000));
                    }
                }
            }
            console.warn(`[Summarizer] ${provider.name} exhausted. Trying next provider...`);
        }

        // All providers failed — log a distinct, greppable error
        console.error('[summarizer] ALL_PROVIDERS_EXHAUSTED — every configured provider and all OpenRouter fallback models failed. Provider chain:', providers.map(p => p.name).join(' → '));

        return {
            extractive: "Failed to generate summary. All providers are currently unavailable.",
            events: [
                "All AI providers returned errors.",
                "Your API key may be rate-limited or invalid.",
                "Try again in a minute, or add a different API key in Settings."
            ]
        };
    }
}

export const summarizerService = new SummarizerService();
