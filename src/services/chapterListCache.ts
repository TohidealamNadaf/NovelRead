type CacheEntry = { novel: any; chapters: any[]; liveChapters: any[]; ts: number };
const cache = new Map<string, CacheEntry>();

function normalizeKey(key: string): string {
    if (!key) return '';
    try {
        let decoded = key.includes('%') ? decodeURIComponent(key) : key;
        return decoded.trim().replace(/\/$/, '').replace(/\/chapters$/i, '').toLowerCase();
    } catch {
        return key.trim().replace(/\/$/, '').replace(/\/chapters$/i, '').toLowerCase();
    }
}

export const chapterListCache = {
    get(novelId: string): CacheEntry | null {
        if (!novelId) return null;
        const direct = cache.get(novelId);
        if (direct) return direct;

        const normalized = normalizeKey(novelId);
        const fromNorm = cache.get(normalized);
        if (fromNorm) return fromNorm;

        // Try restoring from sessionStorage for resilience
        try {
            const raw = sessionStorage.getItem(`novel_cache_${normalized}`);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Date.now() - parsed.ts < 3600 * 1000) { // 1 hour validity
                    cache.set(novelId, parsed);
                    cache.set(normalized, parsed);
                    return parsed;
                }
            }
        } catch {
            // Safe fallback if sessionStorage is unavailable
        }

        return null;
    },

    set(novelId: string, entry: Omit<CacheEntry, 'ts'>) {
        if (!novelId) return;
        const normalized = normalizeKey(novelId);
        const fullEntry: CacheEntry = { ...entry, ts: Date.now() };

        cache.set(novelId, fullEntry);
        cache.set(normalized, fullEntry);

        // Store into sessionStorage if reasonable size (<1MB)
        try {
            sessionStorage.setItem(`novel_cache_${normalized}`, JSON.stringify(fullEntry));
        } catch {
            // Quota exceeded or private browsing, safe ignore
        }
    },

    delete(novelId: string) {
        if (!novelId) return;
        const normalized = normalizeKey(novelId);
        cache.delete(novelId);
        cache.delete(normalized);
        try {
            sessionStorage.removeItem(`novel_cache_${normalized}`);
        } catch { }
    },

    clear() {
        cache.clear();
        try {
            for (let i = 0; i < sessionStorage.length; i++) {
                const k = sessionStorage.key(i);
                if (k?.startsWith('novel_cache_')) {
                    sessionStorage.removeItem(k);
                }
            }
        } catch { }
    }
};
