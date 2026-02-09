export class SummarizerService {
    // text cleaning regex
    private static readonly STOP_WORDS = new Set([
        'a', 'an', 'the', 'and', 'or', 'but', 'if', 'because', 'as', 'what',
        'when', 'where', 'how', 'who', 'whom', 'which', 'this', 'that', 'these',
        'those', 'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
        'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'shall',
        'should', 'can', 'could', 'may', 'might', 'must', 'of', 'at', 'by',
        'for', 'with', 'about', 'against', 'between', 'into', 'through', 'during',
        'before', 'after', 'above', 'below', 'to', 'from', 'up', 'down', 'in',
        'out', 'on', 'off', 'over', 'under', 'again', 'further', 'then', 'once',
        'here', 'there', 'why', 'how', 'all', 'any', 'both', 'each', 'few',
        'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only',
        'own', 'same', 'so', 'than', 'too', 'very', 's', 't', 'can', 'will',
        'just', 'don', 'should', 'now'
    ]);

    /**
     * Main entry point to summarize text.
     * Returns both an extractive summary paragraph and a list of key event bullets.
     */
    public summarize(text: string): { extractive: string, events: string[] } {
        if (!text || text.length < 500) {
            return {
                extractive: text || "",
                events: []
            };
        }

        // 1. Segment text into sentences
        const sentences = this.segmentSentences(text);
        if (sentences.length === 0) return { extractive: "", events: [] };

        // 2. Extract keywords and calculate frequencies
        const wordFreq = this.calculateWordFrequencies(sentences);

        // 3. Score sentences
        const scoredSentences = sentences.map((sentence, index) => {
            const score = this.scoreSentence(sentence, index, sentences.length, wordFreq);
            return { ...sentence, score };
        });

        // 4. Select top sentences for Extractive Summary (Top 15%)
        // Sort by score descending
        const sortedByScore = [...scoredSentences].sort((a, b) => b.score - a.score);

        const summaryCount = Math.max(3, Math.ceil(sentences.length * 0.15));
        const topSentences = sortedByScore.slice(0, summaryCount);

        // Sort back by original index to preserve flow
        const summarySentences = topSentences.sort((a, b) => a.index - b.index);
        const extractive = summarySentences.map(s => s.text).join(' ');

        // 5. Select items for Key Events (Top 5-8 items, distinct from summary if possible)
        // We simply take the very highest scoring ones that are "action-oriented" (heuristic: verb presence?)
        // For simplicity, we use the top scoring ones but formatted as bullets.
        const eventCount = Math.min(8, Math.max(3, Math.ceil(sentences.length * 0.05)));
        const eventSentences = sortedByScore.slice(0, eventCount).sort((a, b) => a.index - b.index);
        const events = eventSentences.map(s => s.text);

        return { extractive, events };
    }

    private segmentSentences(text: string): { text: string; index: number }[] {
        // Simple segmentation: split by . ! ? followed by space or end of string
        // Also handling quotes slightly
        const cleanText = text.replace(/\s+/g, ' ').trim();
        const matches = cleanText.match(/[^.!?]+[.!?]+(?:\s|$)/g);

        if (!matches) return [{ text: cleanText, index: 0 }];

        return matches
            .map((s, i) => ({ text: s.trim(), index: i }))
            .filter(s => s.text.length > 20); // Filter out tiny fragments
    }

    private calculateWordFrequencies(sentences: { text: string }[]): Map<string, number> {
        const freq = new Map<string, number>();

        sentences.forEach(s => {
            const words = s.text.toLowerCase().split(/[\s,.!?;:"'()]+/);
            words.forEach(w => {
                if (w.length > 2 && !SummarizerService.STOP_WORDS.has(w) && !/^\d+$/.test(w)) {
                    freq.set(w, (freq.get(w) || 0) + 1);
                }
            });
        });

        return freq;
    }

    private scoreSentence(
        sentence: { text: string },
        index: number,
        totalSentences: number,
        wordFreq: Map<string, number>
    ): number {
        const words = sentence.text.toLowerCase().split(/[\s,.!?;:"'()]+/);
        let validWordCount = 0;
        let wordScore = 0;

        // Keyword Score
        words.forEach(w => {
            if (wordFreq.has(w)) {
                wordScore += wordFreq.get(w)!;
                validWordCount++;
            }
        });

        if (validWordCount === 0) return 0;

        // Normalize by length (density)
        let totalScore = wordScore / words.length;

        // Position Bias
        const position = index / totalSentences;
        if (position < 0.2) {
            totalScore *= 1.2; // Boost intro
        } else if (position > 0.8) {
            totalScore *= 1.1; // Slight boost outro
        }

        // Length Penalty
        if (words.length < 6) totalScore *= 0.5; // Too short
        if (words.length > 40) totalScore *= 0.8; // Too long / run-on

        // Dialogue Penalty (Heuristic: contains quotes)
        if (sentence.text.includes('"') || sentence.text.includes('“') || sentence.text.includes('”')) {
            totalScore *= 0.8; // Reduce dialogue priority for summary
        }

        return totalScore;
    }
}

export const summarizerService = new SummarizerService();
