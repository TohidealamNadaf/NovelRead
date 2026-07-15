import type { NovelMetadata } from '../scraper.service';
import { manhwaScraperService } from '../manhwaScraper.service';
import { Capacitor } from '@capacitor/core';

const BASE_URL = 'https://mangafire.to';

export interface MangaFirePage { url: string; width: number; height: number; }

export class MangaFireScraperService {
    private sessionProxyMode: 'vite' | 'codetabs' | 'corsproxy' | null = null;
    private viteBlockedUntil = 0;

    private sleep(ms: number) {
        return new Promise(res => setTimeout(res, ms));
    }
    
    private async fetchWithProxy(url: string): Promise<string> {
        const isNative = Capacitor.isNativePlatform();
        
        if (!isNative) {
            const now = Date.now();
            // Already know Vite proxy is rate-limited this session — skip straight to fallback
            if (now < this.viteBlockedUntil) {
                return await this.tryFallbackProxies(url);
            }

            const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`;
            try {
                console.log(`[MangaFire] Fetching via Vite proxy: ${url}`);
                const response = await fetch(proxyUrl, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json, text/plain, */*',
                        'X-Requested-With': 'XMLHttpRequest',
                    }
                });
                
                if (response.status === 429) {
                    console.warn('[MangaFire] Vite proxy 429 — backing off 60s for this session');
                    this.viteBlockedUntil = Date.now() + 60_000;
                    return await this.tryFallbackProxies(url);
                }
                
                if (!response.ok) {
                    console.error(`[MangaFire] HTTP ${response.status} for ${url}`);
                    return await this.tryFallbackProxies(url);
                }
                
                const text = await response.text();
                console.log(`[MangaFire] Successfully fetched ${text.length} chars`);
                return text;
            } catch (e) {
                console.error('[MangaFire] Vite proxy error:', e);
                return await this.tryFallbackProxies(url);
            }
        } else {
            // Native platform - use CapacitorHttp
            return await manhwaScraperService.fetchHtml(url);
        }
    }

    private async tryFallbackProxies(url: string): Promise<string> {
        // If a fallback already worked this session, try it FIRST instead of always
        // starting from codetabs — avoids re-discovering the working proxy every page.
        const order: Array<'codetabs' | 'corsproxy'> =
            this.sessionProxyMode === 'corsproxy'
                ? ['corsproxy', 'codetabs']
                : ['codetabs', 'corsproxy'];

        const proxyUrls = {
            codetabs: 'https://api.codetabs.com/v1/proxy?quest=',
            corsproxy: 'https://corsproxy.io/?url=',
        };

        for (const key of order) {
            try {
                console.log(`[MangaFire] Trying fallback proxy: ${key}`);
                const proxyUrl = `${proxyUrls[key]}${encodeURIComponent(url)}`;
                const response = await fetch(proxyUrl, {
                    headers: {
                        'Accept': 'application/json, text/plain, */*',
                        'X-Requested-With': 'XMLHttpRequest',
                    }
                });
                if (response.status === 429) {
                    await this.sleep(800);
                    continue;
                }
                if (response.ok) {
                    const text = await response.text();
                    if (text && text.length > 100) {
                        this.sessionProxyMode = key; // remember the winner for next page
                        return text;
                    }
                }
            } catch (e) {
                console.warn(`[MangaFire] Fallback proxy failed: ${key}`, e);
            }
        }
        return '';
    }
    
    private async fetchJson(url: string): Promise<any> {
        const response = await this.fetchWithProxy(url);
        if (!response) {
            console.error('[MangaFire] No response received');
            return null;
        }
        
        try {
            // Try to parse as JSON
            const json = JSON.parse(response);
            console.log('[MangaFire] Successfully parsed JSON response');
            return json;
        } catch (e) {
            // Check if it's an HTML error page
            if (response.includes('<!DOCTYPE') || response.includes('<html')) {
                console.error('[MangaFire] Received HTML instead of JSON - likely blocked or wrong endpoint');
                return null;
            }
            console.error('[MangaFire] Failed to parse JSON:', e);
            console.log('[MangaFire] Response preview:', response.substring(0, 200));
            return null;
        }
    }

    private extractIdFromUrl(url: string): string {
        try {
            const urlObj = new URL(url);
            const pathParts = urlObj.pathname.split('/').filter(Boolean);
            
            // Handle different URL patterns
            if (pathParts.length >= 2) {
                const lastPart = pathParts[pathParts.length - 1];
                
                // Check for .id format
                if (lastPart.includes('.')) {
                    return lastPart.split('.').pop() || '';
                }
                
                // Check for id-slug format
                if (lastPart.includes('-')) {
                    const firstPart = lastPart.split('-')[0];
                    // Validate it looks like an ID (alphanumeric, typically 2-10 chars)
                    if (/^[a-z0-9]{2,10}$/i.test(firstPart)) {
                        return firstPart;
                    }
                }
                
                // Return the whole part if no pattern matches
                return lastPart;
            }
            
            return '';
        } catch {
            console.error('[MangaFire] Failed to extract ID from URL:', url);
            return '';
        }
    }

    private parseTitleObject(item: any): NovelMetadata {
        // Handle poster being an object with small/medium/large properties
        let coverUrl = '';
        if (typeof item.poster === 'string') {
            coverUrl = item.poster;
        } else if (item.poster && typeof item.poster === 'object') {
            coverUrl = item.poster.medium || item.poster.small || item.poster.large || '';
        } else {
            coverUrl = item.cover || item.image || '';
        }

        return {
            title: item.title || item.name || 'Unknown',
            author: 'Unknown',
            coverUrl: coverUrl,
            category: 'Manhwa',
            status: item.status || 'Ongoing',
            summary: item.synopsis || item.description || '',
            sourceUrl: `${BASE_URL}/title/${item.hid || item.id}-${item.slug || ''}`,
            chapters: []
        };
    }

    private extractListFromData(data: any): NovelMetadata[] {
        if (!data) return [];
        
        let items: any[] = [];
        if (Array.isArray(data)) {
            items = data;
        } else if (data.items && Array.isArray(data.items)) {
            // ADD THIS CHECK - MangaFire returns {items: [...], meta: {...}}
            items = data.items;
        } else if (data.data && Array.isArray(data.data)) {
            items = data.data;
        } else if (data.result && Array.isArray(data.result)) {
            items = data.result;
        } else if (data.data && data.data.items && Array.isArray(data.data.items)) {
            items = data.data.items;
        }

        return items.map(item => this.parseTitleObject(item)).filter(item => item.title && item.title !== 'Unknown');
    }

    async getDiscoverManga(): Promise<{ trending: NovelMetadata[], popular: NovelMetadata[], latest: NovelMetadata[] }> {
        try {
            const [trendingData, popularData, latestData] = await Promise.all([
                this.fetchJson(`${BASE_URL}/api/top-titles?type=trending&days=1&limit=30`),
                this.fetchJson(`${BASE_URL}/api/titles?order[relevance]=desc&page=1&limit=30`), // using relevance for popular
                this.fetchJson(`${BASE_URL}/api/titles?order[chapter_updated_at]=desc&page=1&limit=30`)
            ]);

            return {
                trending: this.extractListFromData(trendingData),
                popular: this.extractListFromData(popularData),
                latest: this.extractListFromData(latestData)
            };
        } catch (e) {
            console.error('[MangaFire] Discovery error:', e);
            return { trending: [], popular: [], latest: [] };
        }
    }

    async searchManga(query: string): Promise<NovelMetadata[]> {
        if (!query) return [];
        try {
            const searchUrl = `${BASE_URL}/api/titles?keyword=${encodeURIComponent(query)}&limit=30`;
            const data = await this.fetchJson(searchUrl);
            return this.extractListFromData(data);
        } catch (e) {
            console.error('[MangaFire] Search error:', e);
            return [];
        }
    }

    // Phase 1 — fast, single request, no chapters
    async fetchMetadata(url: string): Promise<NovelMetadata | null> {
        const id = this.extractIdFromUrl(url);
        if (!id) return null;

        const metadataJson = await this.fetchJson(`${BASE_URL}/api/titles/${id}`);
        if (!metadataJson) return null;

        const item = metadataJson.data || metadataJson;
        const novel = this.parseTitleObject(item);
        novel.sourceUrl = url.startsWith('http') ? url : `${BASE_URL}/title/${id}`;
        novel.chapters = []; // filled in later by phase 2
        return novel;
    }

    // Phase 2 — slow, paginated, runs after the hero is already on screen
    async fetchChapterList(url: string): Promise<{ title: string; url: string; date: string }[]> {
        const id = this.extractIdFromUrl(url);
        if (!id) return [];

        let allChapterItems: any[] = [];
        let page = 1;
        let totalPages: number | null = null;

        while (page <= (totalPages ?? 50)) {
            const chaptersJson = await this.fetchJson(
                `${BASE_URL}/api/titles/${id}/chapters?language=en&sort=number&order=desc&page=${page}&limit=30`
            );
            if (!chaptersJson) break;

            const meta = chaptersJson.meta || chaptersJson.data?.meta;
            if (meta?.last_page) totalPages = meta.last_page;
            else if (meta?.total && meta?.per_page) totalPages = Math.ceil(meta.total / meta.per_page);

            let chapterItems: any[] = [];
            if (Array.isArray(chaptersJson)) chapterItems = chaptersJson;
            else if (chaptersJson.items) chapterItems = chaptersJson.items;
            else if (chaptersJson.data && Array.isArray(chaptersJson.data)) chapterItems = chaptersJson.data;
            else if (chaptersJson.result) chapterItems = chaptersJson.result;
            else if (chaptersJson.data?.items) chapterItems = chaptersJson.data.items;

            if (chapterItems.length === 0) break;
            allChapterItems = allChapterItems.concat(chapterItems);
            page++;
            if (page <= (totalPages ?? 50)) await this.sleep(350);
        }

        allChapterItems.sort((a, b) => (parseFloat(a.number || a.chapter) || 0) - (parseFloat(b.number || b.chapter) || 0));

        return allChapterItems.map((ch: any) => ({
            title: ch.name || `Chapter ${ch.number || ch.chapter}`,
            url: `${BASE_URL}/api/chapters/${ch.id}`,
            date: ch.created_at || ''
        }));
    }

    // Kept for any existing caller that wants everything at once (background refresh, etc.)
    async fetchMangaDetails(url: string): Promise<NovelMetadata | null> {
        const novel = await this.fetchMetadata(url);
        if (!novel) return null;
        novel.chapters = await this.fetchChapterList(url);
        return novel;
    }

    async fetchChapterImages(url: string): Promise<MangaFirePage[]> {
        // url is either the original web URL or the api URL we stored above
        let apiUrl = url;
        if (!url.includes('/api/chapters/')) {
            // If it's a web URL like /title/85y3-dogul-wangg/chapter/7606764, extract chapter ID
            const parts = url.split('/');
            const chapterId = parts[parts.length - 1];
            apiUrl = `${BASE_URL}/api/chapters/${chapterId}`;
        }

        try {
            const data = await this.fetchJson(apiUrl);
            if (!data) return [];
            
            const chapterObj = data.data || data;
            if (chapterObj && chapterObj.pages && Array.isArray(chapterObj.pages)) {
                return chapterObj.pages.map((p: any) => ({ url: p.url || p, width: parseInt(p.width)||0, height: parseInt(p.height)||0 }));
            }
            return [];
        } catch (e) {
            console.error('[MangaFire] Images error:', e);
            return [];
        }
    }

    async fetchSeriesList(page: number): Promise<NovelMetadata[]> {
        try {
            const data = await this.fetchJson(`${BASE_URL}/api/titles?order[relevance]=desc&page=${page}&limit=30`);
            return this.extractListFromData(data);
        } catch (e) {
            console.error('[MangaFire] Series list error:', e);
            return [];
        }
    }

    async fetchLatestUpdates(page: number): Promise<NovelMetadata[]> {
        try {
            // Correct sort param for "Latest Updates" on MangaFire
            const data = await this.fetchJson(
                `${BASE_URL}/api/titles?order[chapter_updated_at]=desc&page=${page}&limit=30`
            );
            return this.extractListFromData(data);
        } catch (e) {
            console.error('[MangaFire] Latest updates error:', e);
            return [];
        }
    }
}

export const mangafireScraperService = new MangaFireScraperService();
