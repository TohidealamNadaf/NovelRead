import { CapacitorHttp } from '@capacitor/core';
import { Capacitor } from '@capacitor/core';
import { dbService } from './db.service';
import { notificationService } from './notification.service';
import * as cheerio from 'cheerio';
import type { NovelMetadata, ScraperProgress } from './scraper.service';
import { asuraScraperService } from './manhwa/asura.service';
import { mangafireScraperService } from './manhwa/mangafire.service';

export class ManhwaScraperService {
    private isScrapingInternal = false;
    private currentProgress: ScraperProgress = { current: 0, total: 0, currentTitle: '', logs: [] };
    private activeNovel: NovelMetadata | null = null;
    private listeners: ((progress: ScraperProgress, isScraping: boolean) => void)[] = [];

    get isScraping() { return this.isScrapingInternal; }
    get progress() { return this.currentProgress; }
    get activeNovelMetadata() { return this.activeNovel; }

    subscribe(listener: (progress: ScraperProgress, isScraping: boolean) => void) {
        this.listeners.push(listener);
        listener(this.currentProgress, this.isScrapingInternal);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    private notifyListeners() {
        this.listeners.forEach(l => l(this.currentProgress, this.isScrapingInternal));
    }

    resetProgress() {
        this.currentProgress = { current: 0, total: 0, currentTitle: '', logs: [] };
        this.activeNovel = null;
        this.notifyListeners();
    }

    // --- Proxy Management ---
    // On native (Android/iOS), direct fetch works best (no CORS).
    // On web, we need proxies. Order matters - try best ones first.
    private getProxies(): string[] {
        const isNative = Capacitor.isNativePlatform();

        if (isNative) {
            // Direct first for native, then fallbacks
            return [
                '', // Direct fetch - best on native, no CORS issues
                'https://api.codetabs.com/v1/proxy?quest=',
                'https://corsproxy.io/?url=',
            ];
        }

        // Web: use Vite dev proxy to bypass CORS entirely
        return [
            '/api/proxy?url=', // Vite dev server proxy - bypasses CORS
        ];
    }

    // Check if HTML is a real page or a Cloudflare/bot challenge
    private isValidHtml(html: string): boolean {
        if (!html || html.length < 500) return false;
        // Cloudflare challenge page indicators
        const blockedIndicators = [
            'cf-browser-verification',
            'Checking your browser',
            'Just a moment',
            'Enable JavaScript and cookies',
            'Attention Required',
            'Access denied',
            '403 Forbidden',
            'cf-challenge',
            '_cf_chl',
            'Verifying you are human'
        ];
        for (const indicator of blockedIndicators) {
            if (html.includes(indicator)) {
                return false;
            }
        }
        return true;
    }

    async fetchHtml(url: string, proxyUrl?: string): Promise<string> {
        if (!navigator.onLine) {
            console.warn('[ManhwaScraper] Device is offline, skipping fetchHtml');
            return '';
        }

        let finalUrl = url;
        if (proxyUrl) {
            if (proxyUrl.includes('corsproxy.io')) {
                finalUrl = `https://corsproxy.io/?url=${encodeURIComponent(url)}`;
            } else if (proxyUrl.includes('codetabs.com')) {
                finalUrl = `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`;
            } else if (proxyUrl.startsWith('/api/proxy')) {
                // Vite dev proxy - use relative URL
                finalUrl = `/api/proxy?url=${encodeURIComponent(url)}`;
            } else {
                finalUrl = `${proxyUrl}${encodeURIComponent(url)}`;
            }
        }

        const proxyName = proxyUrl
            ? (proxyUrl.startsWith('/') ? 'vite-proxy' : (proxyUrl.split('/')[2] || 'direct'))
            : 'direct';

        try {
            console.log(`[ManhwaScraper] Trying via ${proxyName}...`);

            let html = '';

            // For Vite dev proxy (relative URL), use native fetch instead of CapacitorHttp
            if (finalUrl.startsWith('/')) {
                const response = await fetch(finalUrl, {
                    headers: {
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    }
                });
                if (response.ok) {
                    html = await response.text();
                } else {
                    console.warn(`[ManhwaScraper] ✗ HTTP ${response.status} via ${proxyName}`);
                    return '';
                }
            } else {
                const options = {
                    url: finalUrl,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.6167.178 Mobile Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.5',
                        'Referer': 'https://google.com',
                    },
                    connectTimeout: 30000,
                    readTimeout: 30000
                };

                const response = await CapacitorHttp.get(options);

                if (response.status === 200 && response.data) {
                    if (typeof response.data === 'object') {
                        html = JSON.stringify(response.data);
                    } else {
                        html = String(response.data || '');
                    }
                } else {
                    console.warn(`[ManhwaScraper] ✗ HTTP ${response.status} via ${proxyName}`);
                    return '';
                }
            }

            // Validate the HTML is real content, not a challenge page
            if (this.isValidHtml(html)) {
                console.log(`[ManhwaScraper] ✓ Got valid HTML (${html.length} chars) via ${proxyName}`);
                return html;
            } else {
                console.warn(`[ManhwaScraper] ✗ Blocked/challenge page via ${proxyName}`);
            }
        } catch (error) {
            console.warn(`[ManhwaScraper] ✗ Fetch error via ${proxyName}:`, error);
        }
        return '';
    }

    // Try all proxies and return the first valid HTML
    public async fetchWithAllProxies(url: string): Promise<string> {
        for (const proxy of this.getProxies()) {
            const html = await this.fetchHtml(url, proxy || undefined);
            if (html && this.isValidHtml(html)) {
                return html;
            }
        }
        return '';
    }

    // --- Core Scraping Logic ---

    // --- Discovery API ---
    async getDiscoveryData(source: 'asura' | 'mangafire' = 'asura'): Promise<{ trending: NovelMetadata[], popular: NovelMetadata[], latest: NovelMetadata[] }> {
        try {
            if (source === 'mangafire') {
                return await mangafireScraperService.getDiscoverManga();
            }
            return await asuraScraperService.getDiscoverManga();
        } catch (error) {
            console.error('[ManhwaScraper] Error fetching discovery data:', error);
            return { trending: [], popular: [], latest: [] };
        }
    }

    async fetchSeriesList(page: number, source: 'asura' | 'mangafire' = 'asura'): Promise<NovelMetadata[]> {
        if (source === 'mangafire') {
            return await mangafireScraperService.fetchSeriesList(page);
        }
        return await asuraScraperService.fetchSeriesList(page);
    }

    async fetchLatestUpdates(page: number, source: 'asura' | 'mangafire' = 'asura'): Promise<NovelMetadata[]> {
        if (source === 'mangafire') {
            return await mangafireScraperService.fetchLatestUpdates(page);
        }
        // Asura has no dedicated "latest" API; /browse?page=N is the closest paginated feed
        return await asuraScraperService.fetchSeriesList(page);
    }

    // --- Search API ---
    async searchManga(query: string, source: 'asura' | 'mangafire' = 'asura'): Promise<NovelMetadata[]> {
        if (source === 'mangafire') {
            return await mangafireScraperService.searchManga(query);
        }
        return await asuraScraperService.searchManga(query);
    }

    async fetchNovelMetadata(url: string): Promise<NovelMetadata | null> {
        const cacheKey = `novelMeta_${url}`;
        const cached = await dbService.getCache(cacheKey);
        if (cached?.timestamp && Date.now() - cached.timestamp < 15 * 60 * 1000) {
            return cached.data;
        }

        if (url.includes('mangafire.to')) {
            const result = await mangafireScraperService.fetchMetadata(url);
            if (result) await dbService.setCache(cacheKey, { data: result, timestamp: Date.now() });
            return result;
        }

        if (url.includes('asuracomic.net') || url.includes('asuratoon.com') || url.includes('asurascans.com')) {
            const full = await asuraScraperService.fetchMangaDetails(url);
            if (!full) return null;

            const { chapters, ...metaOnly } = full;
            await dbService.setCache(cacheKey, { data: { ...metaOnly, chapters: [] }, timestamp: Date.now() });
            const mappedChapters = chapters.map(ch => ({ ...ch, date: ch.date || '' }));
            await dbService.setCache(`novelChapters_${url}`, { data: mappedChapters, timestamp: Date.now() });
            return { ...metaOnly, chapters: [] } as NovelMetadata;
        }

        const result = await this.fetchGenericNovel(url);
        if (result) await dbService.setCache(cacheKey, { data: result, timestamp: Date.now() });
        return result;
    }

    async fetchNovelChapters(url: string): Promise<{ title: string; url: string; date: string }[]> {
        const cacheKey = `novelChapters_${url}`;
        const cached = await dbService.getCache(cacheKey);
        if (cached?.timestamp && Date.now() - cached.timestamp < 15 * 60 * 1000) {
            return cached.data;
        }

        let chapters: { title: string; url: string; date: string }[] = [];
        if (url.includes('mangafire.to')) {
            chapters = await mangafireScraperService.fetchChapterList(url);
        } else if (url.includes('asuracomic.net') || url.includes('asuratoon.com') || url.includes('asurascans.com')) {
            const full = await asuraScraperService.fetchMangaDetails(url);
            chapters = (full?.chapters || []).map(ch => ({ ...ch, date: ch.date || '' }));
        } else {
            const full = await this.fetchGenericNovel(url);
            chapters = (full?.chapters || []).map(ch => ({ ...ch, date: ch.date || '' }));
        }

        if (chapters.length > 0) await dbService.setCache(cacheKey, { data: chapters, timestamp: Date.now() });
        return chapters;
    }

    async fetchNovel(url: string): Promise<NovelMetadata> {
        const cacheKey = `novelDetails_${url}`;
        const cached = await dbService.getCache(cacheKey);
        if (cached?.timestamp && Date.now() - cached.timestamp < 15 * 60 * 1000) {
            console.log('[ManhwaScraper] Serving cached novel details (15 min TTL) — no network hit');
            return cached.data;
        }

        let result: NovelMetadata;
        if (url.includes('mangafire.to')) {
            result = (await mangafireScraperService.fetchMangaDetails(url)) || await this.fetchGenericNovel(url);
        } else if (url.includes('asuracomic.net') || url.includes('asuratoon.com') || url.includes('asurascans.com')) {
            result = (await asuraScraperService.fetchMangaDetails(url)) || await this.fetchGenericNovel(url);
        } else {
            result = await this.fetchGenericNovel(url);
        }

        if (result?.chapters?.length > 0) {
            await dbService.setCache(cacheKey, { data: result, timestamp: Date.now() });
        }
        return result;
    }

    private async fetchGenericNovel(url: string): Promise<NovelMetadata> {
        const html = await this.fetchWithAllProxies(url);

        if (!html) {
            const isWeb = !Capacitor.isNativePlatform();
            throw new Error(
                isWeb
                    ? 'Could not fetch this site from the browser. Try importing on your Android device for better compatibility.'
                    : 'Failed to fetch manhwa site. The site may be down or blocking requests.'
            );
        }

        const $ = cheerio.load(html);
        const title = $('h1').first().text().trim();
        const coverUrl = $('img[src*="cover"], .summary_image img, img.wp-post-image').attr('src') || '';

        const chapters: { title: string; url: string }[] = [];
        const chapterUrlSetGeneric = new Set<string>();
        $('li .chapter-item a, .wp-manga-chapter a, #chapterlist li a, .eph-num a').each((_, el) => {
            const t = $(el).text().trim();
            const u = $(el).attr('href');
            if (t && u && !chapterUrlSetGeneric.has(u)) { chapterUrlSetGeneric.add(u); chapters.push({ title: t, url: u }); }
        });
        if (chapters.length > 0) chapters.reverse();

        return {
            title: title || 'Unknown Manhwa',
            author: 'Unknown',
            coverUrl,
            category: 'Manhwa',
            chapters,
            summary: 'Imported Manhwa'
        };
    }

    async startImport(url: string, novel: NovelMetadata) {
        if (this.isScrapingInternal) return;
        this.isScrapingInternal = true;
        this.activeNovel = novel;
        this.currentProgress = { current: 0, total: novel.chapters.length, currentTitle: 'Preparing...', logs: [] };
        this.notifyListeners();

        // Generate a stable ID based on URL slug if possible
        let slug = '';
        try {
            const urlObj = new URL(url);
            const pathParts = urlObj.pathname.split('/').filter(Boolean);
            // For Asura Scans: /comics/slug or /series/slug
            if ((url.includes('asuracomic.net') || url.includes('asurascans.com')) && pathParts.length >= 2) {
                slug = pathParts[1];
            } else if (url.includes('mangafire.to')) {
                // For MangaFire: /manga/slug.id or /title/id-slug
                const lastPart = pathParts[pathParts.length - 1] || '';
                slug = lastPart.split('.')[0]; // grab the slug part
            } else {
                slug = pathParts[pathParts.length - 1] || '';
            }
        } catch (e) {
            console.warn('Failed to parse URL for slug', e);
        }

        // Filter slug to be safe, fallback to title if slug is empty
        const idBase = (slug || novel.title)
            .replace(/[^a-zA-Z0-9\s-]/g, '')
            .replace(/\s+/g, '-')
            .toLowerCase()
            .slice(0, 32);

        // Generate a deterministic ID based on the URL path to avoid duplicates
        // Matches logic in useChapterActions but with 'manhwa-' prefix for clarity (or just use standard slug)
        // actually, let's just use the idBase we already calculated, it's decent.
        // But let's make sure it's consistent.
        // const novelId = `${idBase}-${Math.random().toString(36).slice(2, 7)}`; // OLD RANDOM
        const novelId = `manhwa-${idBase}`.slice(0, 80); // NEW DETERMINISTIC

        try {
            await dbService.initialize();

            // Just save the novel metadata and empty chapters
            // We do Lazy Loading for Manhwa images (fetch on read)
            // But we can pre-fetch them if requested. For now, let's just save the list.

            await dbService.addNovel({
                id: novelId,
                title: novel.title,
                author: novel.author || 'Unknown',
                coverUrl: novel.coverUrl,
                sourceUrl: url,
                category: 'Manhwa', // Explicitly set Manhwa
                status: novel.status,
                summary: novel.summary || ''
            });

            // Save chapters with empty content (will be fetched on read / explicit download)
            this.currentProgress.logs.push(`Saving ${novel.chapters.length} chapters...`);
            this.notifyListeners();

            const chaptersToSave = [];
            for (let i = 0; i < novel.chapters.length; i++) {
                const ch = novel.chapters[i];
                chaptersToSave.push({
                    id: `${novelId}-ch-${i + 1}`,
                    novelId,
                    title: ch.title,
                    content: '', // EMPTY for now (Lazy Load)
                    orderIndex: i,
                    audioPath: ch.url, // Store URL in audioPath for reference 
                    date: ch.date
                });
            }

            if (chaptersToSave.length > 0) {
                this.currentProgress.currentTitle = 'Writing to database...';
                this.notifyListeners();
                await dbService.addChapters(chaptersToSave);
                this.currentProgress.current = chaptersToSave.length;
            }

            this.currentProgress.logs.unshift(`✅ Import complete! ${novel.chapters.length} chapters saved.`);
            this.notifyListeners();

            await this.finishNotification(novel.title, true, `Imported ${novel.title}`, novelId);

        } catch (e) {
            console.error(e);
            await this.finishNotification(novel.title, false, 'Import failed');
        } finally {
            this.isScrapingInternal = false;
            this.notifyListeners();
        }
    }

    // --- Lazy Loading Images ---

    /**
     * Check if an image is likely a chapter page (content) or an ad/extra.
     */
    private isContentPage(url: string): boolean {
        if (!url || url.toLowerCase().includes('.gif')) return false;

        // MangaFire CDN pattern: filename is always literally "p.jpg"/"p.webp" etc,
        // with the real identifying hash living in the path (e.g. /mf/{64charhash}/h/p.jpg).
        // Must check this BEFORE filename-based heuristics since "p" alone fails all of them.
        if (/\/mf\/[a-f0-9]{20,}\/h\/p\.(jpg|jpeg|png|webp|avif)(\?.*)?$/i.test(url)) {
            return true;
        }

        const urlWithoutQuery = url.split('?')[0];
        const filename = urlWithoutQuery.split('/').pop() || '';
        const nameWithoutExt = filename.replace(/\.(jpg|jpeg|png|webp|avif|gif)$/i, '');
        const cleanName = nameWithoutExt.replace(/-optimized|_optimized/i, '');
        const lowerName = cleanName.toLowerCase();

        const blacklist = ['logo', 'banner', 'discord', 'promo', 'ad-', '_ad', 'patreon', 'ko-fi', 'credit', 'recruit', 'intro', 'outro'];
        if (blacklist.some(term => lowerName.includes(term))) return false;

        if (/^\d+$/.test(cleanName)) return true;
        if (/^(page|img|image|p|i)?[-_]?\d+$/i.test(cleanName)) return true;
        if (/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(cleanName)) return true;
        if (/^[a-f0-9]{4,32}$/i.test(cleanName)) return true;

        return false;
    }

    /**
     * Sort HTML <img> tags: Ads/Extras first, then Content pages sorted numerically.
     */
    /**
     * Filter HTML <img> tags: Ads/Extras first, then Content pages.
     * DOES NOT SORT by filename number anymore. Trusts DOM order.
     */
    private filterImageTags(imgTags: string[]): string[] {
        const contentPages: string[] = [];
        const extras: string[] = [];

        const getSrc = (tag: string) => {
            const match = tag.match(/src="([^"]+)"/);
            return match ? match[1] : '';
        };

        imgTags.forEach(tag => {
            const src = getSrc(tag);
            // Filter out empty URLs and GIFs
            if (!src || src.toLowerCase().includes('.gif')) return;

            if (this.isContentPage(src)) {
                contentPages.push(tag);
            } else {
                extras.push(tag);
            }
        });

        // extras.sort(); // Optional: keep extras sorted if needed, or just append them

        // Return extras (usually logos) first, then content
        // Or actually, usually we want content first? 
        // Logic before was: extras (alpha) then content (numeric). 
        // Let's just return content pages in order found.
        return contentPages;
    }

    async fetchChapterImages(url: string): Promise<string> {
        // MANGAFIRE
        if (url.includes('mangafire.to')) {
            const images = await mangafireScraperService.fetchChapterImages(url);
            if (images.length === 0) return '<p>No images found.</p>';
            return images.map(p => `<img src="${p.url}" data-w="${p.width}" data-h="${p.height}" data-trusted="true" width="${p.width}" height="${p.height}" class="w-full" loading="lazy" />`).join('');
        }

        // ASURA SCANS
        if (url.includes('asuracomic.net') || url.includes('asuratoon.com') || url.includes('asurascans.com')) {
            const images = await asuraScraperService.fetchChapterImages(url);
            if (images.length === 0) return '<p>No images found.</p>';
            // Images from asura service are already sorted by filename number
            return images.map(src => `<img src="${src}" data-trusted="true" class="w-full object-contain" loading="lazy" />`).join('');
        }


        const html = await this.fetchWithAllProxies(url);
        if (!html) {
            return '<p>Failed to load images. The site may be blocking requests.</p>';
        }

        const $ = cheerio.load(html);
        $('script, style, iframe, .ads, .banner, noscript').remove();

        // Selectors for images - ordered by specificity
        const selectors = [
            '#readerarea img',
            '.reading-content img',
            '.vung-doc img',
            '.container-chapter-reader img',
            '.chapter-content img',
            '.entry-content img',
            '.text-left img',
            'article img'
        ];

        const foundImages: string[] = [];

        for (const sel of selectors) {
            const imgs = $(sel);
            if (imgs.length > 0) {
                imgs.each((_, img) => {
                    const src = $(img).attr('data-src')
                        || $(img).attr('data-lazy-src')
                        || $(img).attr('data-cfsrc')
                        || $(img).attr('src');
                    if (src && !src.includes('ads') && !src.includes('logo')
                        && !src.includes('icon') && !src.includes('avatar')
                        && (src.includes('.jpg') || src.includes('.png') || src.includes('.webp')
                            || src.includes('cdn') || src.includes('img') || src.includes('upload'))) {
                        foundImages.push(`<img src="${src.trim()}" class="w-full object-contain" loading="lazy" />`);
                    }
                });
                if (foundImages.length > 0) break;
            }
        }

        if (foundImages.length > 0) {
            // Filter images but KEEP DOM ORDER
            const filtered = this.filterImageTags(foundImages);
            console.log(`[ManhwaScraper] Found ${filtered.length} images for chapter (DOM order)`);
            return filtered.join('');
        }

        return '<p>No images found for this chapter.</p>';
    }

    private async finishNotification(title: string, success: boolean, body: string, novelId?: string) {
        // Use 'scrape' type for now as 'import' might not be in the type definition yet
        if (success) {
            await notificationService.addNotification({
                title: `Manhwa Imported: ${title}`,
                body: body,
                type: 'scrape',
                payload: { novelId, category: 'Manhwa' }
            });
        }
    }
}

export const manhwaScraperService = new ManhwaScraperService();
