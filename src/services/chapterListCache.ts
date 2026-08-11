type CacheEntry = { novel: any; chapters: any[]; liveChapters: any[]; ts: number };
const cache = new Map<string, CacheEntry>();

export const chapterListCache = {
    get(novelId: string) {
        return cache.get(novelId) ?? null;
    },
    set(novelId: string, entry: Omit<CacheEntry, 'ts'>) {
        cache.set(novelId, { ...entry, ts: Date.now() });
    }
};
