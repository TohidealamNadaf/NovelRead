import { CapacitorHttp } from '@capacitor/core';
import { Capacitor } from '@capacitor/core';
import { dbService } from './db.service';
import { notificationService } from './notification.service';
import * as cheerio from 'cheerio';
import type { NovelMetadata, ScraperProgress } from './scraper.service';
import { mangaDexService } from './manhwa/mangaDex.service';
import { asuraScraperService } from './manhwa/asura.service';

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
                        'Referer': url.includes('kagane.org') ? 'https://kagane.org/' : 'https://google.com',
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
    private async fetchWithAllProxies(url: string): Promise<string> {
        for (const proxy of this.getProxies()) {
            const html = await this.fetchHtml(url, proxy || undefined);
            if (html && this.isValidHtml(html)) {
                return html;
            }
        }
        return '';
    }

    // --- Comick.art API ---

    private getComickApiBase(): string {
        const isNative = Capacitor.isNativePlatform();
        return isNative ? 'https://api.comick.io' : '/api/comick';
    }

    private async fetchComickApi(endpoint: string): Promise<any> {
        const base = this.getComickApiBase();
        const url = `${base}${endpoint}`;

        try {
            console.log(`[ManhwaScraper] Comick API: ${endpoint}`);

            if (url.startsWith('/')) {
                // Web: use Vite proxy
                const response = await fetch(url, {
                    headers: { 'Accept': 'application/json' }
                });
                if (response.ok) {
                    return await response.json();
                }

                // Handle Cloudflare strict blocking & Proxy errors
                if (response.status === 403 || response.status === 502) {
                    throw new Error('Cloudflare protection is blocking web requests. Please allow the certificate or use the Android app.');
                }

                console.warn(`[ManhwaScraper] Comick API HTTP ${response.status}`);
                return null;
            } else {
                // Native: use CapacitorHttp
                const response = await CapacitorHttp.get({
                    url,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 Chrome/121.0 Mobile Safari/537.36',
                        'Accept': 'application/json',
                        'Referer': 'https://comick.art/',
                        'Origin': 'https://comick.art',
                    },
                    connectTimeout: 30000,
                    readTimeout: 30000
                });
                if (response.status === 200 && response.data) {
                    return typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
                }
                console.warn(`[ManhwaScraper] Comick API HTTP ${response.status}`);
                return null;
            }
        } catch (error: any) {
            console.warn('[ManhwaScraper] Comick API error:', error);
            // Propagate Cloudflare errors to UI
            if (error.message && error.message.includes('Cloudflare')) {
                throw error;
            }
            return null;
        }
    }

    private extractSlugFromComickUrl(url: string): string {
        // https://comick.art/comic/00-solo-leveling → 00-solo-leveling
        const match = url.match(/comick\.art\/comic\/([^\/\?#]+)/);
        return match ? match[1] : '';
    }

    private async fetchComickComic(url: string): Promise<NovelMetadata> {
        const slug = this.extractSlugFromComickUrl(url);
        if (!slug) throw new Error('Invalid comick.art URL. Expected format: https://comick.art/comic/{slug}');

        const data = await this.fetchComickApi(`/comic/${slug}`);
        if (!data || !data.comic) {
            throw new Error('Failed to fetch comic data from comick.art. The comic may not exist or the API is down.');
        }

        const comic = data.comic;
        const title = comic.title || 'Unknown Title';
        const coverUrl = comic.md_covers?.[0]?.b2key
            ? `https://meo.comick.pictures/${comic.md_covers[0].b2key}`
            : '';
        const author = comic.md_comic_md_authors?.map((a: any) => a.md_author?.name).filter(Boolean).join(', ') ||
            data.authors?.map((a: any) => a.name).filter(Boolean).join(', ') ||
            'Unknown';
        const summary = comic.desc || comic.parsed || '';
        const status = comic.status === 1 ? 'Ongoing' : comic.status === 2 ? 'Completed' : 'Unknown';

        // Fetch chapters to extract publishers
        const chaptersData = await this.fetchComickApi(`/comic/${slug}/chapters?lang=en&limit=300&page=0`);

        const publishers = new Set<string>();
        const chapters: { title: string; url: string }[] = [];

        if (chaptersData?.chapters) {
            for (const ch of chaptersData.chapters) {
                // Extract publisher/group names
                const groupNames = ch.md_groups?.map((g: any) => g.title).filter(Boolean) ||
                    ch.group_name || [];
                if (Array.isArray(groupNames)) {
                    groupNames.forEach((name: string) => publishers.add(name));
                } else if (typeof groupNames === 'string') {
                    publishers.add(groupNames);
                }

                const chNum = ch.chap || '0';
                const chTitle = ch.title ? `Ch. ${chNum} - ${ch.title}` : `Chapter ${chNum}`;
                const chUrl = `https://comick.art/comic/${slug}/${ch.hid}-chapter-${chNum}-en`;

                if (!chapters.some(c => c.url === chUrl)) {
                    chapters.push({
                        title: chTitle,
                        url: ch.hid // Store the HID for API access
                    });
                }
            }
        }

        // If we need more pages of chapters
        if (chaptersData?.chapters?.length === 300) {
            let page = 1;
            while (true) {
                const moreData = await this.fetchComickApi(`/comic/${slug}/chapters?lang=en&limit=300&page=${page}`);
                if (!moreData?.chapters || moreData.chapters.length === 0) break;

                for (const ch of moreData.chapters) {
                    const groupNames = ch.md_groups?.map((g: any) => g.title).filter(Boolean) || [];
                    groupNames.forEach((name: string) => publishers.add(name));

                    const chNum = ch.chap || '0';
                    const chTitle = ch.title ? `Ch. ${chNum} - ${ch.title}` : `Chapter ${chNum}`;

                    if (!chapters.some(c => c.url === ch.hid)) {
                        chapters.push({ title: chTitle, url: ch.hid });
                    }
                }

                if (moreData.chapters.length < 300) break;
                page++;
            }
        }

        console.log(`[ManhwaScraper] Comick: "${title}" - ${chapters.length} chapters, ${publishers.size} publishers`);

        return {
            title,
            author,
            coverUrl,
            summary,
            status,
            category: 'Manhwa',
            chapters,
            publishers: Array.from(publishers).sort()
        };
    }

    // Refetch chapters filtered by a specific publisher
    async fetchComickChaptersByPublisher(url: string, publisherName: string): Promise<{ title: string; url: string }[]> {
        const slug = this.extractSlugFromComickUrl(url);
        if (!slug) return [];

        const chapters: { title: string; url: string }[] = [];
        let page = 0;

        while (true) {
            const data = await this.fetchComickApi(`/comic/${slug}/chapters?lang=en&limit=300&page=${page}`);
            if (!data?.chapters || data.chapters.length === 0) break;

            for (const ch of data.chapters) {
                const groupNames = ch.md_groups?.map((g: any) => g.title).filter(Boolean) || [];

                // Filter by publisher
                if (groupNames.includes(publisherName)) {
                    const chNum = ch.chap || '0';
                    const chTitle = ch.title ? `Ch. ${chNum} - ${ch.title}` : `Chapter ${chNum}`;

                    if (!chapters.some(c => c.url === ch.hid)) {
                        chapters.push({ title: chTitle, url: ch.hid });
                    }
                }
            }

            if (data.chapters.length < 300) break;
            page++;
        }

        console.log(`[ManhwaScraper] Filtered by "${publisherName}": ${chapters.length} chapters`);
        return chapters;
    }

    private async fetchComickChapterImages(hid: string): Promise<string> {
        const data = await this.fetchComickApi(`/chapter/${hid}`);
        if (!data?.chapter?.md_images || data.chapter.md_images.length === 0) {
            return '<p>No images found for this chapter.</p>';
        }

        const images = data.chapter.md_images
            .sort((a: any, b: any) => (a.idx || 0) - (b.idx || 0))
            .map((img: any) => {
                const src = img.b2key ? `https://meo.comick.pictures/${img.b2key}` : '';
                if (src) {
                    return `<img src="${src}" class="w-full object-contain" loading="lazy" />`;
                }
                return '';
            })
            .filter(Boolean);

        console.log(`[ManhwaScraper] Comick: Found ${images.length} images`);
        return images.join('');
    }

    // --- Core Scraping Logic ---

    // --- Discovery API ---
    async getDiscoveryData(): Promise<{ trending: NovelMetadata[], popular: NovelMetadata[], latest: NovelMetadata[] }> {
        try {
            return await asuraScraperService.getDiscoverManga();
        } catch (error) {
            console.error('[ManhwaScraper] Error fetching discovery data:', error);
            return { trending: [], popular: [], latest: [] };
        }
    }

    async fetchSeriesList(page: number): Promise<NovelMetadata[]> {
        return await asuraScraperService.fetchSeriesList(page);
    }

    // --- Search API ---
    async searchManga(query: string, source: 'mangadex' | 'asura' = 'mangadex'): Promise<NovelMetadata[]> {
        if (source === 'asura') {
            return await asuraScraperService.searchManga(query);
        }
        return await mangaDexService.searchManga(query);
    }

    async fetchNovel(url: string): Promise<NovelMetadata> {
        // ASURA SCANS
        if (url.includes('asuracomic.net') || url.includes('asuratoon.com')) {
            const data = await asuraScraperService.fetchMangaDetails(url);
            if (data) return data;
        }

        // MANGADEX SUPPORT
        if (url.includes('mangadex.org')) {
            const id = url.split('/title/')[1]?.split('/')[0] || url.split('/manga/')[1]?.split('/')[0];
            if (id) {
                const data = await mangaDexService.fetchMangaDetails(id);
                if (data) return data;
            }
        }

        // COMICK.ART API-BASED
        if (url.includes('comick.art')) {
            return this.fetchComickComic(url);
        }

        // KAGANE.ORG SPECIAL HANDLING
        if (url.includes('kagane.org')) {
            return this.fetchKaganeNovel(url);
        }

        // GENERIC FALLBACK
        return this.fetchGenericNovel(url);
    }

    private async fetchKaganeNovel(url: string): Promise<NovelMetadata> {
        const html = await this.fetchWithAllProxies(url);

        if (!html) {
            const isWeb = !Capacitor.isNativePlatform();
            throw new Error(
                isWeb
                    ? 'Kagane.org uses Cloudflare protection which blocks web browsers. Please try importing on your Android device where native HTTP bypasses this restriction.'
                    : 'Failed to fetch Kagane.org content. The site may be temporarily down or blocking requests.'
            );
        }

        const $ = cheerio.load(html);

        // Try multiple selectors for title
        const title = $('h1.entry-title').text().trim()
            || $('.post-title h1').text().trim()
            || $('h1').first().text().trim()
            || 'Unknown Title';

        // Try multiple selectors for cover
        const coverUrl = $('.thumb img').attr('data-src')
            || $('.thumb img').attr('src')
            || $('.summary_image img').attr('data-src')
            || $('.summary_image img').attr('src')
            || $('img.wp-post-image').attr('src')
            || '';

        const author = $('.author-content a').text().trim()
            || $('.author-content').text().trim()
            || 'Unknown';

        const status = $('.post-status .summary-content').text().trim()
            || $('.status .summary-content').text().trim()
            || 'Ongoing';

        const summary = $('.summary__content p').text().trim()
            || $('.description-summary .summary__content').text().trim()
            || '';

        // Extract chapters - try multiple selectors
        const chapters: { title: string; url: string }[] = [];

        // Selector 1: Kagane standard
        const chapterSelectors = [
            '#chapterlist li a',
            '.wp-manga-chapter a',
            '.eph-num a',
            '.listing-chapters_wrap a',
            '.version-chap a',
            'ul.main li a'
        ];

        for (const selector of chapterSelectors) {
            $(selector).each((_, el) => {
                const a = $(el);
                const chTitle = a.find('.chapternum').text().trim()
                    || a.find('.chapter-manhwa-title').text().trim()
                    || a.text().trim();
                const chUrl = a.attr('href');

                if (chTitle && chUrl && !chapters.some(c => c.url === chUrl)) {
                    chapters.push({ title: chTitle, url: chUrl });
                }
            });
            if (chapters.length > 0) break;
        }

        // Kagane typically lists newest first, reverse for chronological order
        if (chapters.length > 0) {
            chapters.reverse();
        }

        console.log(`[ManhwaScraper] Found: "${title}" with ${chapters.length} chapters`);

        return {
            title,
            author,
            coverUrl,
            summary,
            status,
            category: 'Manhwa',
            chapters
        };
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
        $('li .chapter-item a, .wp-manga-chapter a, #chapterlist li a, .eph-num a').each((_, el) => {
            const t = $(el).text().trim();
            const u = $(el).attr('href');
            if (t && u && !chapters.some(c => c.url === u)) chapters.push({ title: t, url: u });
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
            // For Asura Scans: /series/slug
            if (url.includes('asuracomic.net') && pathParts.length >= 2) {
                slug = pathParts[1];
            } else if (url.includes('mangadex.org') && pathParts.length >= 2) {
                slug = pathParts[1];
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
                status: novel.status
            });

            // Save chapters with empty content (will be fetched on read / explicit download)
            this.currentProgress.logs.push(`Saving ${novel.chapters.length} chapters...`);
            this.notifyListeners();

            for (let i = 0; i < novel.chapters.length; i++) {
                const ch = novel.chapters[i];
                this.currentProgress.current = i + 1;
                this.currentProgress.currentTitle = ch.title;
                this.currentProgress.logs.unshift(`✓ ${ch.title}`);
                this.notifyListeners();

                await dbService.addChapter({
                    id: `${novelId}-ch-${i + 1}`,
                    novelId,
                    title: ch.title,
                    content: '', // EMPTY for now (Lazy Load)
                    orderIndex: i,
                    audioPath: ch.url, // Store URL in audioPath for reference 
                    date: ch.date
                });
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
        // Explicitly exclude GIFs
        if (url.toLowerCase().includes('.gif')) return false;

        const filename = url.split('/').pop() || '';
        const nameWithoutExt = filename.replace(/\.(jpg|jpeg|png|webp|avif|gif)$/i, '');
        const cleanName = nameWithoutExt.replace(/-optimized|_optimized/i, '');

        if (/^\d+$/.test(cleanName)) return true;
        if (/^[a-zA-Z0-9_-]{0,10}[-_]?\d+$/.test(cleanName)) return true;
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
        // ASURA SCANS
        if (url.includes('asuracomic.net') || url.includes('asuratoon.com')) {
            const images = await asuraScraperService.fetchChapterImages(url);
            if (images.length === 0) return '<p>No images found.</p>';
            // Images from asura service are already sorted by filename number
            return images.map(src => `<img src="${src}" class="w-full object-contain" loading="lazy" />`).join('');
        }

        // MANGADEX
        if (url.includes('mangadex.org')) {
            const id = url.split('/chapter/')[1]?.split('/')[0];
            if (id) {
                const images = await mangaDexService.fetchChapterImages(id);
                if (images.length === 0) return '<p>No images found in this chapter.</p>';
                // MangaDex API returns images in correct order
                return images.map(src => `<img src="${src}" class="w-full object-contain" loading="lazy" />`).join('');
            }
        }

        // Comick.art: URL is actually a HID (short hash), not a real URL
        if (url && !url.startsWith('http') && url.length < 30) {
            return this.fetchComickChapterImages(url);
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
