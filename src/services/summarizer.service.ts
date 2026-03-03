export class SummarizerService {
    /**
     * Main entry point to summarize text using the Gemini 2.5 Flash API.
     * Returns both an extractive summary paragraph and a list of key event bullets.
     */
    public async generateSummary(
        chapterTitle: string,
        text: string,
        apiKey: string
    ): Promise<{
        extractive: string,
        events: string[],
        structuredOverview?: { header: string, intro: string, bullets: string[] }[]
    }> {
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
                events: Array.isArray(parsed.events) ? parsed.events : [],
                structuredOverview: Array.isArray(parsed.structuredOverview) ? parsed.structuredOverview : undefined
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
