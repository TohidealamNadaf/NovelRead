import { CapacitorHttp } from '@capacitor/core';
import { Capacitor } from '@capacitor/core';
import { dbService } from './db.service';
import { notificationService } from './notification.service';
import * as cheerio from 'cheerio';
import type { NovelMetadata, ScraperProgress } from './scraper.service';

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
                'https://api.allorigins.win/get?url=',
            ];
        }

        // Web: use web-scraping-friendly proxies that handle JS rendering
        return [
            'https://api.codetabs.com/v1/proxy?quest=',
            'https://corsproxy.io/?url=',
            'https://api.allorigins.win/get?url=',
            'https://api.webscraping.ai/html?api_key=demo&url=',
            '' // Direct fetch last (will likely fail on web due to CORS)
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
        let finalUrl = url;
        if (proxyUrl) {
            if (proxyUrl.includes('corsproxy.io')) {
                finalUrl = `https://corsproxy.io/?url=${encodeURIComponent(url)}`;
            } else if (proxyUrl.includes('allorigins.win')) {
                finalUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
            } else if (proxyUrl.includes('codetabs.com')) {
                finalUrl = `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`;
            } else if (proxyUrl.includes('webscraping.ai')) {
                finalUrl = `https://api.webscraping.ai/html?api_key=demo&url=${encodeURIComponent(url)}`;
            } else {
                finalUrl = `${proxyUrl}${encodeURIComponent(url)}`;
            }
        }

        const options = {
            url: finalUrl,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.6167.178 Mobile Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Referer': url.includes('kagane.org') ? 'https://kagane.org/' : 'https://google.com',
                'Cache-Control': 'no-cache'
            },
            connectTimeout: 30000,
            readTimeout: 30000
        };

        try {
            const proxyName = proxyUrl ? proxyUrl.split('/')[2] || 'direct' : 'direct';
            console.log(`[ManhwaScraper] Trying via ${proxyName}...`);
            const response = await CapacitorHttp.get(options);

            if (response.status === 200 && response.data) {
                let html = '';
                if (proxyUrl && proxyUrl.includes('allorigins.win')) {
                    try {
                        const parsed = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
                        html = parsed.contents || '';
                    } catch {
                        html = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
                    }
                } else if (typeof response.data === 'object') {
                    html = JSON.stringify(response.data);
                } else {
                    html = String(response.data || '');
                }

                // Validate the HTML is real content, not a challenge page
                if (this.isValidHtml(html)) {
                    console.log(`[ManhwaScraper] ✓ Got valid HTML (${html.length} chars) via ${proxyName}`);
                    return html;
                } else {
                    console.warn(`[ManhwaScraper] ✗ Blocked/challenge page via ${proxyName}`);
                }
            } else {
                console.warn(`[ManhwaScraper] ✗ HTTP ${response.status} via ${proxyName}`);
            }
        } catch (error) {
            const proxyName = proxyUrl ? proxyUrl.split('/')[2] || 'direct' : 'direct';
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

    // --- Core Scraping Logic ---

    async fetchNovel(url: string): Promise<NovelMetadata> {
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

        const novelId = novel.title.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '-').toLowerCase().slice(0, 24) + '-' + Math.random().toString(36).slice(2, 7);

        try {
            await dbService.initialize();

            // Just save the novel metadata and empty chapters
            // We do Lazy Loading for Manhwa images (fetch on read)
            // But we can pre-fetch them if requested. For now, let's just save the list.

            await dbService.addNovel({
                id: novelId,
                title: novel.title,
                author: novel.author,
                coverUrl: novel.coverUrl,
                sourceUrl: url,
                category: 'Manhwa',
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
                    audioPath: ch.url // Store URL in audioPath for reference 
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
    async fetchChapterImages(url: string): Promise<string> {
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
            console.log(`[ManhwaScraper] Found ${foundImages.length} images for chapter`);
            return foundImages.join('');
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
                payload: { novelId }
            });
        }
    }
}

export const manhwaScraperService = new ManhwaScraperService();
