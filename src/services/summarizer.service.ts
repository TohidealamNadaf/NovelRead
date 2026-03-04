interface SummaryResult {
    extractive: string;
    events: string[];
    structuredOverview?: { header: string; intro: string; bullets: string[] }[];
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
   - "header": A thematic title for the section (max 4-6 words).
   - "intro": A very short, single-sentence introductory paragraph for the section.
   - "bullets": An array of strings (max 2-3 bullets per section). Each string is a brief, one-sentence bullet point with an entity/subject and description.
CRITICAL INSTRUCTION: The total output must be extremely concise. Do NOT exceed 3 sections total. Keep the entire summary roughly the same length as a few short paragraphs.
2. "extractive": A brief fallback string summarizing the chapter.
3. "events": An array of strings, where each string is a concise bullet point of a key action, revelation, or event that occurred. (3-6 bullet points)

Output ONLY valid JSON. Do not use Markdown formatting for the JSON block itself.

Chapter Content:
${safeText}`;
    }

    /**
     * Parse the raw LLM text response into a SummaryResult.
     */
    private parseResponse(rawText: string): SummaryResult {
        // Strip potential markdown code fences
        const cleaned = rawText.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
        const parsed = JSON.parse(cleaned);
        return {
            extractive: parsed.extractive || "Unable to extract summary.",
            events: Array.isArray(parsed.events) ? parsed.events : [],
            structuredOverview: Array.isArray(parsed.structuredOverview) ? parsed.structuredOverview : undefined
        };
    }

    /**
     * Try Groq API (Llama 3.3 70B — free tier: 30 RPM, 6000 TPM).
     */
    private async tryGroq(prompt: string, apiKey: string): Promise<SummaryResult> {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
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
            console.error('Groq API Error:', response.status, err);
            throw new Error(`Groq API failed with status ${response.status}`);
        }

        const data = await response.json();
        const text = data.choices?.[0]?.message?.content;
        if (!text) throw new Error('Empty response from Groq API');
        return this.parseResponse(text);
    }

    /**
     * Try Gemini API (gemini-2.0-flash — free tier: 15 RPM, 1M TPM).
     */
    private async tryGemini(prompt: string, apiKey: string): Promise<SummaryResult> {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
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
            console.error('Gemini API Error:', response.status, err);
            throw new Error(`Gemini API failed with status ${response.status}`);
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) {
            if (data.candidates?.[0]?.finishReason === 'SAFETY') {
                throw new Error('Content blocked by Gemini safety settings.');
            }
            throw new Error('Empty response from Gemini API');
        }
        return this.parseResponse(text);
    }

    /**
     * Main entry point. Tries providers in order with automatic fallback.
     * Provider priority: Groq (if key provided) → Gemini (if key provided).
     */
    public async generateSummary(
        chapterTitle: string,
        text: string,
        apiKey: string,
        groqApiKey?: string | null
    ): Promise<SummaryResult> {
        // Fallback for extremely short texts
        if (!text || text.length < 200) {
            return { extractive: text || "", events: [] };
        }

        // Clean and truncate
        const cleanText = text.replace(/\s+/g, ' ').trim();
        const safeText = cleanText.substring(0, 30000);
        const prompt = this.buildPrompt(chapterTitle, safeText);

        // Build provider list in priority order
        const providers: { name: string; fn: () => Promise<SummaryResult> }[] = [];

        if (groqApiKey) {
            providers.push({
                name: 'Groq',
                fn: () => this.tryGroq(prompt, groqApiKey)
            });
        }

        if (apiKey) {
            providers.push({
                name: 'Gemini',
                fn: () => this.tryGemini(prompt, apiKey)
            });
        }

        if (providers.length === 0) {
            return {
                extractive: "AI Summarization requires an API key. Add a free Groq or Gemini API key in Settings.",
                events: [
                    "Open the app Settings",
                    "Scroll down to Advanced > AI Summarizer Key",
                    "Get a free API key from Groq (groq.com) or Google AI Studio and paste it there."
                ]
            };
        }

        // Try each provider in order with one retry per provider
        for (const provider of providers) {
            for (let attempt = 0; attempt < 2; attempt++) {
                try {
                    console.log(`[Summarizer] Trying ${provider.name} (attempt ${attempt + 1})...`);
                    const result = await provider.fn();
                    console.log(`[Summarizer] ${provider.name} succeeded!`);
                    return result;
                } catch (error) {
                    console.warn(`[Summarizer] ${provider.name} attempt ${attempt + 1} failed:`, error);
                    if (attempt === 0) {
                        // Wait 3 seconds before retry
                        await new Promise(r => setTimeout(r, 3000));
                    }
                }
            }
            console.warn(`[Summarizer] ${provider.name} exhausted. Trying next provider...`);
        }

        // All providers failed
        return {
            extractive: "Failed to generate summary. All providers are currently unavailable.",
            events: [
                "All AI providers returned errors.",
                "Your API key may be rate-limited or invalid.",
                "Try again in a minute, or check your API key in Settings."
            ]
        };
    }
}

export const summarizerService = new SummarizerService();
