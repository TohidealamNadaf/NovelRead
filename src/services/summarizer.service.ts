export class SummarizerService {
    /**
     * Main entry point to summarize text using the Gemini 2.5 Flash API.
     * Returns both an extractive summary paragraph and a list of key event bullets.
     */
    public async generateSummary(chapterTitle: string, text: string, apiKey: string): Promise<{ extractive: string, events: string[] }> {
        // Fallback for extremely short texts
        if (!text || text.length < 200) {
            return {
                extractive: text || "",
                events: []
            };
        }

        try {
            // Clean the text slightly to save tokens
            const cleanText = text.replace(/\s+/g, ' ').trim();
            // Truncate massively long text just in case (e.g. 50k chars is well within context limits but good for safety)
            const safeText = cleanText.substring(0, 100000);

            const prompt = `You are an expert novel summarizer.
Analyze the following chapter content titled "${chapterTitle}".
Return a strict JSON object with two keys:
1. "extractive": A brief, engaging multi-paragraph summary (max 2-3 short paragraphs). Keep it concise so it doesn't read like a full chapter. If important characters are speaking, include critical conversational dialogue/talking if necessary for better understanding. Separate paragraphs with a double newline (\\n\\n).
2. "events": An array of strings, where each string is a concise bullet point of a key action, revelation, or event that occurred. (3-6 bullet points)

Output ONLY valid JSON. Do not use Markdown formatting for the JSON block itself.

Chapter Content:
${safeText}`;

            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: prompt
                        }]
                    }],
                    generationConfig: {
                        temperature: 0.3,
                        responseMimeType: "application/json",
                    }
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error("Gemini API Error:", errorData);
                throw new Error("Failed to generate summary from Gemini API.");
            }

            const data = await response.json();
            const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;

            if (!textResponse) {
                throw new Error("Invalid response structure from Gemini API.");
            }

            const parsed = JSON.parse(textResponse);
            return {
                extractive: parsed.extractive || "Unable to extract summary.",
                events: Array.isArray(parsed.events) ? parsed.events : []
            };

        } catch (error) {
            console.error("SummarizerService.generateSummary Error:", error);
            // Fallback object on failure
            return {
                extractive: "Failed to generate summary due to an error.",
                events: ["Please check your internet connection.", "Ensure your API key is valid in settings.", "Try again later."]
            };
        }
    }
}

export const summarizerService = new SummarizerService();
