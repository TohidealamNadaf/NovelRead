import { CapacitorHttp, Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { dbService } from './db.service';
import { notificationService } from './notification.service';
import * as cheerio from 'cheerio';

export interface NovelMetadata {
    title: string;
    author: string;
    coverUrl: string;
    summary?: string;
    status?: string;
    category?: string;
    chapters: { title: string; url: string }[];
    publishers?: string[];
    selectedPublisher?: string;
    sourceUrl?: string; // For search results to link back to source
    sourceId?: string; // Original ID from source
}

export interface HomeData {
    recommended: NovelMetadata[];
    ranking: NovelMetadata[];
    latest: NovelMetadata[];
    recentlyAdded: NovelMetadata[];
    completed: NovelMetadata[];
}

export interface ScraperProgress {
    current: number;
    total: number;
    currentTitle: string;
    logs: string[];
}

export class ScraperService {
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

    resetProgress() {
        this.currentProgress = { current: 0, total: 0, currentTitle: '', logs: [] };
        this.clearMetadata();
        this.notifyListeners();
    }

    clearMetadata() {
        this.activeNovel = null;
    }

    private notifyListeners() {
        this.listeners.forEach(l => l(this.currentProgress, this.isScrapingInternal));
    }

    /**
     * Step 3: Mandatory Cleaning Layer
     * Path: scraper.service.ts
     * Removes: Leading numbers, trailing timestamps, UI labels, excess whitespace.
     */
    public cleanChapterTitle(raw: string): string {
        if (!raw) return '';

        let cleaned = raw.trim();

        // 1. Remove leading numeric indices (e.g., "1 Chapter 1" -> "Chapter 1")
        // Rule: Internal indexing is the only source of truth (index + 1)
        cleaned = cleaned.replace(/^\d+[\s\.\-]+/g, '');

        // 2. Remove timestamps (e.g., "1 day ago", "2 hours ago")
        const timestampRegex = /\b\d+\s*(minute|hour|day|week|month)s?\s*ago\b/gi;
        cleaned = cleaned.replace(timestampRegex, '');

        // 3. Remove common UI labels/artifacts
        cleaned = cleaned.replace(/(NEW|HOT|FREE|UPDATED)$/gi, '');

        // 4. Normalize whitespace
        cleaned = cleaned.replace(/\s+/g, ' ').trim();

        return cleaned;
    }

    /**
     * Step 4: Mandatory Validation Gate
     * Validation MUST reject: low quality, timestamps, non-alphabetic, or tiny titles.
     */
    public isValidChapterTitle(title: string): boolean {
        if (!title) return false;

        // Reject if less than 5 characters
        if (title.length < 5) return false;

        // Reject if it contains "ago" (leaked timestamp)
        if (/\b\d+\s*(minute|hour|day|week|month)s?\s*ago\b/gi.test(title)) return false;

        // Reject if it has no alphabetic characters (e.g., "123", "...")
        if (!/[a-zA-Z]/.test(title)) return false;

        // Reject if numeric-only structure
        if (/^\d+$/.test(title.replace(/\s/g, ''))) return false;

        return true;
    }

    /**
     * Step 1 & 2: Semantic Anchor Extraction ONLY & Strict Field Isolation
     * Step 5: Indexing RULE (Internal index + 1)
     * Deliverable: scrapeChapterList(url: string): Promise<ScrapedChapter[]>
     */
    public async scrapeChapterList(url: string): Promise<{ chapterNumber: number; title: string; link: string }[]> {
        const html = await this.fetchHtml(url);
        if (!html) return [];

        const $ = cheerio.load(html);
        return this.extractChaptersFromPage($, url).map((ch, i) => ({
            chapterNumber: i + 1,
            title: ch.title,
            link: ch.url
        }));
    }

    private extractChaptersFromPage($: cheerio.CheerioAPI, baseUrl: string) {
        const chapters: { title: string; url: string }[] = [];
        const seenLinks = new Set<string>();
        const seenTitles = new Set<string>();

        const listSelectors = [
            '.chapter-list li', 'ul.chapter-list li', '.list-chapter li',
            '#chapter-list li', '.chapters li', '.list-chapters li',
            '#list-chapter .row', '.list-item', '.chapter-item'
        ];

        for (const sel of listSelectors) {
            const items = $(sel);
            if (items.length > 0) {
                items.each((_, el) => {
                    // CRITICAL: NEVER call .text() on the container (el).
                    // This violates the Semantic Anchor Extraction rule.
                    const anchor = $(el).find('a').first();
                    if (anchor.length === 0) return;

                    const rawTitle = anchor.text();
                    const link = anchor.attr('href');

                    if (rawTitle && link) {
                        const cleanTitle = this.cleanChapterTitle(rawTitle);
                        const fullUrl = this.resolveUrl(baseUrl, link);
                        const normalizedTitle = cleanTitle.toLowerCase().replace(/\s+/g, '');

                        if (this.isValidChapterTitle(cleanTitle) && !seenLinks.has(fullUrl) && !seenTitles.has(normalizedTitle)) {
                            chapters.push({ title: cleanTitle, url: fullUrl });
                            seenLinks.add(fullUrl);
                            seenTitles.add(normalizedTitle);
                        }
                    }
                });
                if (chapters.length > 0) break;
            }
        }

        // Fallback: If no list detected, scan all specific chapter-like anchors
        if (chapters.length === 0) {
            $('a').each((_, el) => {
                const anchor = $(el);
                const rawTitle = anchor.text();
                const link = anchor.attr('href');

                if (rawTitle && link && (link.includes('chapter') || link.includes('ch-'))) {
                    const cleanTitle = this.cleanChapterTitle(rawTitle);
                    const fullUrl = this.resolveUrl(baseUrl, link);

                    if (this.isValidChapterTitle(cleanTitle) && !seenLinks.has(fullUrl)) {
                        chapters.push({ title: cleanTitle, url: fullUrl });
                        seenLinks.add(fullUrl);
                    }
                }
            });
        }
        return chapters;
    }

    private findNextPage($: cheerio.CheerioAPI, baseUrl: string): string | null {
        const nextSelectors = ['a[rel="next"]', '.pagination .next a', '.pager .next a', '.pagination a:contains("Next")', 'li.next a'];
        const origin = new URL(baseUrl).origin;
        for (const sel of nextSelectors) {
            const el = $(sel);
            const nextPath = el.attr('href');
            if (nextPath) {
                return nextPath.startsWith('http') ? nextPath : `${origin}${nextPath.startsWith('/') ? '' : '/'}${nextPath}`;
            }
        }
        return null;
    }

    private async updateNotification(novelTitle: string) {
        if (Capacitor.getPlatform() === 'web') return;

        const percentage = Math.round((this.currentProgress.current / this.currentProgress.total) * 100);

        try {
            await LocalNotifications.schedule({
                notifications: [{
                    id: 1001,
                    title: `Importing: ${novelTitle}`,
                    body: `Progress: ${this.currentProgress.current}/${this.currentProgress.total} chapters (${percentage}%)`,
                    largeBody: `Currently scraping: ${this.currentProgress.currentTitle}`,
                    ongoing: true,
                    autoCancel: false,
                    silent: true,
                    schedule: { at: new Date(Date.now() + 100) }
                }]
            });
        } catch (e) {
            console.error("Failed to update notification", e);
        }
    }

    private async finishNotification(novelTitle: string, success: boolean, customMessage?: string, novelId?: string) {
        if (Capacitor.isNativePlatform()) {
            try {
                await LocalNotifications.cancel({ notifications: [{ id: 1001 }] });
                await LocalNotifications.schedule({
                    notifications: [{
                        id: 1002,
                        title: success ? 'Import Success!' : 'Import Failed',
                        body: customMessage || (success ? `Successfully imported ${novelTitle}` : `Failed to import ${novelTitle}`),
                        schedule: { at: new Date(Date.now() + 100) }
                    }]
                });
            } catch (e) {
                console.error("Failed to finish notification", e);
            }
        }

        // Add to in-app notifications
        await notificationService.addNotification({
            title: success ? 'Scrape Complete' : 'Scrape Failed',
            body: customMessage || (success ? `Successfully imported ${novelTitle}` : `Failed to import ${novelTitle}`),
            type: 'scrape',
            imageUrl: this.activeNovel?.coverUrl,
            payload: {
                novelId: novelId || this.activeNovel?.title.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '-').toLowerCase().slice(0, 24),
                category: 'Novel'
            }
        });
    }

    async startImport(url: string, novel: NovelMetadata, category: string = 'Imported') {
        if (this.isScrapingInternal) return;

        this.isScrapingInternal = true;
        this.activeNovel = novel;
        this.currentProgress = { current: 0, total: novel.chapters.length, currentTitle: 'Starting...', logs: [] };
        this.notifyListeners();

        const novelId = novel.title.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '-').toLowerCase().slice(0, 24) + '-' + Math.random().toString(36).slice(2, 7);

        try {
            await dbService.initialize();

            // Save Novel Metadata
            await dbService.addNovel({
                id: novelId,
                title: novel.title,
                author: novel.author,
                coverUrl: novel.coverUrl,
                sourceUrl: url,
                category: category
            });

            await this.scrapeChapterLoop(novelId, novel.chapters, novel.title, 0, category === 'Manhwa');

            await this.finishNotification(novel.title, true, `Successfully imported ${novel.title}`, novelId);
        } catch (error) {
            console.error("Scraping failed", error);
            this.currentProgress.logs.unshift(`[ERROR] ${error instanceof Error ? error.message : String(error)}`);
            await this.finishNotification(novel.title, false, `Failed to import ${novel.title}`, novelId);
        } finally {
            this.isScrapingInternal = false;
            this.notifyListeners();
        }
    }

    async syncNovel(novelId: string, sourceUrl: string, existingChaptersCount: number) {
        if (this.isScrapingInternal) return;

        this.isScrapingInternal = true;
        this.currentProgress = { current: 0, total: 1, currentTitle: 'Checking for updates...', logs: [] };
        this.notifyListeners();

        try {
            const updatedNovel = await this.fetchNovel(sourceUrl);
            this.activeNovel = updatedNovel;

            const newChapters = updatedNovel.chapters.slice(existingChaptersCount);

            if (newChapters.length === 0) {
                this.currentProgress.logs.unshift("No new chapters found.");
                this.notifyListeners();
                await this.finishNotification(updatedNovel.title, true, "No new chapters found.", novelId);
                return;
            }

            this.currentProgress = {
                current: 0,
                total: newChapters.length,
                currentTitle: `Found ${newChapters.length} new chapters`,
                logs: [`Syncing ${newChapters.length} new chapters...`]
            };
            this.notifyListeners();

            await this.scrapeChapterLoop(novelId, newChapters, updatedNovel.title, existingChaptersCount);
            await this.finishNotification(updatedNovel.title, true, `Synced ${newChapters.length} new chapters`, novelId);
        } catch (error) {
            console.error("Sync failed", error);
            this.currentProgress.logs.unshift(`[SYNC ERROR] ${error instanceof Error ? error.message : String(error)}`);
            await this.finishNotification("Sync", false, `Failed to sync novel`, novelId);
        } finally {
            this.isScrapingInternal = false;
            this.notifyListeners();
        }
    }

    async downloadAll(novelId: string, novelTitle: string, chaptersToDownload: { title: string; url: string; audioPath?: string }[]) {
        if (this.isScrapingInternal) return;

        this.isScrapingInternal = true;
        this.currentProgress = { current: 0, total: chaptersToDownload.length, currentTitle: 'Starting downloads...', logs: [] };
        this.notifyListeners();

        try {
            await this.scrapeChapterLoop(novelId, chaptersToDownload, novelTitle);
            await this.finishNotification(novelTitle, true, `Downloaded ${chaptersToDownload.length} chapters`, novelId);
        } catch (error) {
            console.error("Bulk download failed", error);
            this.currentProgress.logs.unshift(`[DOWNLOAD ERROR] ${error instanceof Error ? error.message : String(error)}`);
            await this.finishNotification(novelTitle, false, `Failed to download chapters for ${novelTitle}`, novelId);
        } finally {
            this.isScrapingInternal = false;
            this.notifyListeners();
        }
    }

    private async scrapeChapterLoop(novelId: string, chapters: { title: string; url: string; audioPath?: string }[], novelTitle: string, offset: number = 0, isManhwa: boolean = false) {
        for (let i = 0; i < chapters.length; i++) {
            const ch = chapters[i];
            const currentIndex = offset + i + 1;

            // Safe Duplicate Check: Prevent re-saving existing chapters
            // We use the URL as a unique identifier for the chapter source
            const exists = await dbService.isChapterExists(novelId, ch.url);
            if (exists) {
                console.log(`[Scraper] Skipping existing chapter: ${ch.title}`);
                // Still update progress to reflect we've processed this chapter
                this.currentProgress = {
                    ...this.currentProgress,
                    current: currentIndex,
                    currentTitle: `Skipping: ${ch.title}`
                };
                this.notifyListeners();
                continue;
            }

            // Update progress immutably to trigger React re-renders
            const newLogs = [`[${new Date().toLocaleTimeString()}] Fetching: ${ch.title}`, ...this.currentProgress.logs];
            if (newLogs.length > 50) newLogs.pop();

            this.currentProgress = {
                ...this.currentProgress,
                current: currentIndex,
                currentTitle: ch.title,
                logs: newLogs
            };
            this.notifyListeners();
            await this.updateNotification(novelTitle);

            try {
                const content = isManhwa
                    ? await this.fetchManhwaContent(ch.url)
                    : await this.fetchChapterContent(ch.url);

                if (content && content.length > 50) { // Lower threshold for Manhwa (might be just img tags)
                    const chapterData = {
                        id: `${novelId}-ch-${currentIndex}`,
                        novelId,
                        title: ch.title,
                        content,
                        orderIndex: offset + i, // 0-based storage
                        audioPath: ch.url
                    };
                    await dbService.addChapter(chapterData);

                    // Update log for success
                    const updatedLogs = [...this.currentProgress.logs];
                    updatedLogs[0] = `[${new Date().toLocaleTimeString()}] ${ch.title}: DONE`;

                    this.currentProgress = {
                        ...this.currentProgress,
                        logs: updatedLogs
                    };
                } else {
                    const updatedLogs = [...this.currentProgress.logs];
                    updatedLogs[0] = `[${new Date().toLocaleTimeString()}] ${ch.title}: FAILED (Empty Content)`;

                    this.currentProgress = {
                        ...this.currentProgress,
                        logs: updatedLogs
                    };
                }
            } catch (e) {
                console.error(`Failed to scrape ${ch.title}`, e);
                const updatedLogs = [...this.currentProgress.logs];
                updatedLogs[0] = `[${new Date().toLocaleTimeString()}] ${ch.title}: ERROR`;

                this.currentProgress = {
                    ...this.currentProgress,
                    logs: updatedLogs
                };
            }

            this.notifyListeners();
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    async fetchNovel(url: string): Promise<NovelMetadata> {
        // 1. Determine Info URL (for Metadata) and List URL (for Chapters)
        const infoUrl = url.replace(/\/chapters\/?(\?.*)?$/, '');
        let listUrl = url;
        const userProvidedChapters = /\/chapters\/?(\?.*)?$/.test(url);

        // 2. Fetch Metadata from Info URL
        let title = '';
        let author = '';
        let coverUrl = '';
        let summary = '';
        let status = 'Ongoing';

        const extractMetadata = ($: cheerio.CheerioAPI) => {
            const getMeta = (selectors: string[]) => {
                for (const sel of selectors) {
                    const txt = $(sel).text().trim();
                    if (txt) return txt;
                }
                return '';
            };
            const getAttr = (selectors: string[], attrs: string[]) => {
                for (const sel of selectors) {
                    for (const attr of attrs) {
                        const val = $(sel).attr(attr);
                        if (val && !val.startsWith('data:image')) return val;
                    }
                }
                return '';
            };

            const extractedTitle = getMeta([
                '.novel-info .novel-title', '.title', 'h1', 'h2.title',
                '.book-name', '.truyen-title', 'meta[property="og:title"]'
            ]).split(' Novel - Read')[0].trim();

            const extractedAuthor = getMeta([
                '.author', '.info-author', '.book-author',
                'span[itemprop="author"]', '.txt-author'
            ]).replace('Author:', '').trim() || 'Unknown';

            const extractedSummary = getMeta([
                '.summary__content', '.description', '#editdescription',
                '.book-info-desc', '.content', 'meta[name="description"]'
            ]).trim();

            const extractedStatus = getMeta([
                '.status', '.info-status', '.book-status',
                '.post-content_item:contains("Status") .summary-content'
            ]).trim() || 'Ongoing';

            let extractedCover = getAttr([
                '.novel-cover img', '.book img', '.book-cover img',
                '.img-cover', 'meta[property="og:image"]', '.summary_image img',
                '.book-info-cover img'
            ], ['data-src', 'data-lazy-src', 'data-original', 'src', 'content']);

            if (extractedCover && !extractedCover.startsWith('http')) {
                const origin = 'https://novelfire.net';
                if (extractedCover.startsWith('//')) {
                    extractedCover = `https:${extractedCover}`;
                } else {
                    if (!extractedCover.startsWith('/')) extractedCover = '/' + extractedCover;
                    extractedCover = `${origin}${extractedCover}`;
                }
            }

            return {
                title: extractedTitle,
                author: extractedAuthor,
                coverUrl: extractedCover,
                summary: extractedSummary,
                status: extractedStatus
            };
        };

        // Attempt metadata fetch
        for (const getProxyUrl of this.getProxies()) {
            try {
                const html = await this.fetchHtml(infoUrl, getProxyUrl);
                if (!html || html.length < 500) continue;

                // Detect blocked/captcha pages
                if (html.includes('you have been blocked') ||
                    html.includes('Checking your browser') ||
                    html.includes('Just a moment') ||
                    html.includes('cf-browser-verification') ||
                    html.includes('challenge-form')) {
                    console.warn(`[Scraper] Blocked by Cloudflare/site protection via ${getProxyUrl}`);
                    continue;
                }

                const $ = cheerio.load(html);
                const metadata = extractMetadata($);

                if (metadata.title) {
                    title = metadata.title;
                    author = metadata.author;
                    coverUrl = metadata.coverUrl;
                    summary = metadata.summary;
                    status = metadata.status;

                    if (!userProvidedChapters) {
                        const chaptersLink = $('a[href*="/chapters"]').first().attr('href');
                        if (chaptersLink) {
                            const origin = new URL(infoUrl).origin;
                            listUrl = chaptersLink.startsWith('http') ? chaptersLink : `${origin}${chaptersLink.startsWith('/') ? '' : '/'}${chaptersLink}`;
                        }
                    }
                    break;
                }
            } catch (e) {
                console.warn(`[Scraper] Metadata fetch failed with proxy`, e);
            }
        }

        // 3. Scrape Chapters (Start Loop)
        const allChapters: { title: string; url: string }[] = [];
        const visitedUrls = new Set<string>();
        let pageCount = 0;
        const MAX_PAGES = 50;
        let currentUrl = listUrl;

        // --- Chapter Paging Loop ---
        while (currentUrl && !visitedUrls.has(currentUrl) && pageCount < MAX_PAGES) {
            visitedUrls.add(currentUrl);
            pageCount++;
            let pageFound = false;

            for (const getProxyUrl of this.getProxies()) {
                try {
                    const html = await this.fetchHtml(currentUrl, getProxyUrl);
                    if (!html || html.length < 500) continue;

                    // Detect blocked/captcha pages
                    if (html.includes('you have been blocked') ||
                        html.includes('Checking your browser') ||
                        html.includes('Just a moment') ||
                        html.includes('cf-browser-verification')) {
                        console.warn(`[Scraper] Chapter page blocked via ${getProxyUrl}`);
                        continue;
                    }

                    const $ = cheerio.load(html);
                    const newChapters = this.extractChaptersFromPage($, currentUrl);

                    for (const ch of newChapters) {
                        if (!allChapters.some(c => c.url === ch.url)) {
                            allChapters.push(ch);
                        }
                    }

                    const nextPage = this.findNextPage($, currentUrl);
                    currentUrl = nextPage && !visitedUrls.has(nextPage) ? nextPage : '';
                    pageFound = true;
                    break;
                } catch (e) {
                    console.warn(`[Scraper] Chapter page ${pageCount} failed with proxy`, e);
                }
            }

            if (!pageFound) break;
            if (currentUrl) await new Promise(r => setTimeout(r, 300));
        }

        return {
            title: title || 'Unknown Title',
            author: author || 'Unknown Author',
            coverUrl,
            summary,
            status,
            chapters: allChapters
        };
    }

    private enhanceContent(html: string): string {
        const $ = cheerio.load(html, { xmlMode: false });
        $('*').contents().each((_, elem) => {
            if (elem.type === 'text') {
                let text = $(elem).text();
                text = text.replace(/(\[[^\]]+\])/g, '<span class="smart-system">$1</span>');
                text = text.replace(/(\([^\)]+\))/g, '<span class="smart-note">$1</span>');
                text = text.replace(/(^|\s|>)(')([^']{2,}?)(')(?=$|\s|<|[.,;:?!])/g, '$1<span class="smart-thought">$2$3$4</span>');
                text = text.replace(/(^|\s|>)(\*)([^*]+)(\*)(?=$|\s|<|[.,;:?!])/g, '$1<span class="smart-sfx">$2$3$4</span>');
                $(elem).replaceWith(text);
            }
        });
        return $('body').html() || html;
    }

    resolveUrl(baseUrl: string, relativeUrl: string): string {
        try {
            if (relativeUrl.startsWith('http')) return relativeUrl;
            const urlObj = new URL(baseUrl);
            const origin = urlObj.origin;
            if (relativeUrl.startsWith('//')) return `https:${relativeUrl}`;
            if (relativeUrl.startsWith('/')) return `${origin}${relativeUrl}`;
            const baseDir = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1);
            return `${baseDir}${relativeUrl}`;
        } catch {
            return relativeUrl;
        }
    }

    public async fetchChapterContent(url: string, visitedUrls: Set<string> = new Set()): Promise<string> {
        if (visitedUrls.has(url)) {
            console.warn('[Scraper] Recursive redirect detected for:', url);
            return '<p>Error: Infinite redirect detected at source.</p>';
        }
        visitedUrls.add(url);

        let content = '';

        for (const getProxyUrl of this.getProxies()) {
            try {
                const html = await this.fetchHtml(url, getProxyUrl);
                if (!html || html.length < 500) continue;

                const $ = cheerio.load(html);

                const metaRefresh = $('meta[http-equiv="refresh"]').attr('content');
                if (metaRefresh && metaRefresh.toLowerCase().includes('url=')) {
                    let redirectPart = metaRefresh.split(/url=/i)[1]?.split(';')[0]?.trim();
                    redirectPart = redirectPart?.replace(/['"]/g, '');
                    if (redirectPart) {
                        const resolved = this.resolveUrl(url, redirectPart);
                        return this.fetchChapterContent(resolved, visitedUrls);
                    }
                }

                const scripts = $('script').text();
                const jsReloadMatch = scripts.match(/window\.location\.(?:replace|href)\s*=\s*['"]([^'"]+)['"]/);
                if (jsReloadMatch && jsReloadMatch[1]) {
                    const resolved = this.resolveUrl(url, jsReloadMatch[1]);
                    return this.fetchChapterContent(resolved, visitedUrls);
                }

                $('script, style, .ads, .ad-container, iframe, .hidden, .announcement').remove();

                const contentSelectors = [
                    '#chapter-content', '.chapter-content', '#chr-content',
                    '.read-content', '.reading-content', '.text-left',
                    '#content', '.entry-content', 'article', '.chapter-readable',
                    '.read-container', '.chapter-text', '.chapter-body'
                ];

                for (const sel of contentSelectors) {
                    const el = $(sel);
                    if (el.length > 0 && el.text().trim().length > 200) {
                        content = el.html() || '';
                        break;
                    }
                }

                if (!content || content.length < 500) {
                    $('div, section, main').each((_, el) => {
                        const $el = $(el);
                        const text = $el.text().trim();
                        if (text.length > 1000 && ($el.find('p').length > 3 || $el.find('br').length > 5)) {
                            if (!content || text.length < $(content).text().length) {
                                content = $el.html() || '';
                            }
                        }
                    });
                }

                if (content && content.length > 300) {
                    return this.enhanceContent(content);
                }
            } catch (e) {
                console.warn(`[Scraper] Chapter fetch failed with proxy`, e);
            }
        }
        return '<p>Content not found. The source might be protected or requires a specific redirect.</p>';
    }

    public async fetchManhwaContent(url: string): Promise<string> {
        // Similar to fetchChapterContent but prioritizes image containers
        let content = '';
        for (const getProxyUrl of this.getProxies()) {
            try {
                const html = await this.fetchHtml(url, getProxyUrl);
                if (!html || html.length < 500) continue;

                const $ = cheerio.load(html);
                $('script, style, .ads, .ad-container, iframe, .hidden, .announcement').remove();

                // Selectors common for manga/manhwa sites
                const imageSelectors = [
                    '.reading-content', '.vung-doc', '.read-content',
                    '.page-break', '#chapter-content', '.chapter-content',
                    '#readerarea', '.entry-content', '.container-chapter-reader'
                ];

                for (const sel of imageSelectors) {
                    const el = $(sel);
                    if (el.length > 0 && el.find('img').length > 0) {
                        // Extract just the images to keep it clean
                        const images = el.find('img').map((_, img) => {
                            const src = $(img).attr('data-src') || $(img).attr('data-lazy-src') || $(img).attr('src');
                            if (src) return `<img src="${src}" />`;
                            return '';
                        }).get().join('');

                        if (images.length > 0) {
                            content = images;
                            break;
                        }
                    }
                }

                if (content) return content;
            } catch (e) {
                console.warn(`[Scraper] Manhwa fetch failed`, e);
            }
        }
        return '<p>No images found.</p>';
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
            } else if (proxyUrl.includes('thingproxy')) {
                finalUrl = `https://thingproxy.freeboard.io/fetch/${url}`;
            } else {
                finalUrl = `${proxyUrl}${encodeURIComponent(url)}`;
            }
        }

        const options: { url: string; headers: Record<string, string>; connectTimeout: number; readTimeout: number } = {
            url: finalUrl,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            },
            connectTimeout: 25000,
            readTimeout: 25000
        };

        try {
            console.log(`[Scraper] [web] Fetching: ${finalUrl.substring(0, 100)}...`);
            const response = await CapacitorHttp.get(options);

            if (response.status === 200 && response.data) {
                console.log(`[Scraper] Response Status: 200 for ${url}`);
                if (proxyUrl && proxyUrl.includes('allorigins.win')) {
                    try {
                        const json = JSON.parse(response.data);
                        return json.contents || '';
                    } catch {
                        // Fall out to string check
                    }
                }

                if (typeof response.data === 'object') {
                    return JSON.stringify(response.data);
                }
                return String(response.data || '');
            }
            console.warn(`[Scraper] HTTP ${response.status} for ${url}`);
        } catch (error) {
            console.warn(`[Scraper] Fetch error for ${url}:`, error);
        }

        return '';
    }

    getProxies(): string[] {
        // corsproxy.io works best for NovelFire, try it first
        return [
            'https://corsproxy.io/?url=',
            'https://api.codetabs.com/v1/proxy?quest=',
            'https://api.allorigins.win/get?url=',
            'https://thingproxy.freeboard.io/fetch/'
        ];
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private parseNovelsList($: cheerio.CheerioAPI, selector: any): (NovelMetadata & { sourceUrl: string })[] {
        const novels: (NovelMetadata & { sourceUrl: string })[] = [];
        const origin = 'https://novelfire.net';

        const $container = $(selector);
        const items = $container.hasClass('item') || $container.hasClass('novel-item') || $container.hasClass('book-item')
            ? $container
            : $container.find('.novel-item, .item, .book-item, .list-row, .col-6, .box, [class*="item"], a[href*="/book/"], a[href*="/novel/"]');

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        items.each((_: number, el: any) => {
            const $el = $(el);
            let title = $el.find('h1, h2, h3, h4, h5, .title, .novel-title, .book-name').first().text().trim();
            let url = $el.find('a[href*="/book/"], a[href*="/novel/"]').first().attr('href') || $el.find('a').first().attr('href') || '';

            if (!title) {
                title = $el.find('a').first().attr('title')?.trim() || $el.find('a').first().text().trim();
            }

            if (url && !url.startsWith('http')) {
                if (!url.startsWith('/')) url = '/' + url;
                url = `${origin}${url}`;
            }

            let coverUrl = $el.find('img').attr('data-src') ||
                $el.find('img').attr('data-lazy-src') ||
                $el.find('img').attr('data-original') ||
                $el.find('img').attr('src') || '';

            if (coverUrl) {
                if (coverUrl.startsWith('//')) {
                    coverUrl = `https:${coverUrl}`;
                } else if (!coverUrl.startsWith('http')) {
                    if (!coverUrl.startsWith('/')) coverUrl = '/' + coverUrl;
                    coverUrl = `https://novelfire.net${coverUrl}`;
                }
            }

            const author = $el.find('.author, .book-author').first().text().trim() || 'Unknown';
            const status = $el.find('.status').first().text().trim() || 'Ongoing';

            if (title && url && (url.includes('/book/') || url.includes('/novel/'))) {
                novels.push({
                    title,
                    author,
                    coverUrl,
                    summary: $el.find('.description, .excerpt').first().text().trim() || '',
                    status,
                    sourceUrl: url,
                    chapters: []
                });
            }
        });

        // Deduplicate by sourceUrl
        const seen = new Set<string>();
        return novels.filter(novel => {
            if (seen.has(novel.sourceUrl)) {
                return false;
            }
            seen.add(novel.sourceUrl);
            return true;
        });
    }

    async fetchRanking(type: 'overall' | 'ratings' | 'most-read' | 'most-review' = 'overall', page: number = 1): Promise<NovelMetadata[]> {
        const baseUrl = 'https://novelfire.net/ranking';
        let url = baseUrl;

        if (type === 'ratings') url += '/ratings';
        else if (type === 'most-read') url += '/most-read';
        else if (type === 'most-review') url += '/most-review';

        if (page > 1) {
            url += `?page=${page}`;
        }

        console.log(`[Scraper] Fetching Ranking: ${url} (page ${page})`);

        for (const getProxyUrl of this.getProxies()) {
            try {
                const html = await this.fetchHtml(url, getProxyUrl);
                if (!html || html.length < 500) continue;

                // Detect blocked/captcha pages
                if (html.includes('you have been blocked') ||
                    html.includes('Checking your browser') ||
                    html.includes('Just a moment') ||
                    html.includes('cf-browser-verification')) {
                    console.warn(`[Scraper] Ranking page blocked via ${getProxyUrl}`);
                    continue;
                }

                const $ = cheerio.load(html);

                // Try multiple selectors for the ranking page
                let novels = this.parseNovelsList($, '.rank-novels');
                if (novels.length === 0) {
                    novels = this.parseNovelsList($, '.novel-list');
                }
                if (novels.length === 0) {
                    novels = this.parseNovelsList($, '.list-novel');
                }
                if (novels.length === 0) {
                    // Try direct item selection
                    novels = this.parseNovelsList($, '.novel-item');
                }

                if (novels.length > 0) {
                    console.log(`[Scraper] Ranking fetched ${novels.length} novels via ${getProxyUrl}`);
                    return novels;
                }
            } catch (e) {
                console.error(`[Scraper] Ranking fetch failed for type ${type}, page ${page}`, e);
            }
        }
        return [];
    }

    async fetchLatest(page: number = 1): Promise<NovelMetadata[]> {
        const url = `https://novelfire.net/genre-all/sort-new/status-all/all-novel${page > 1 ? `?page=${page}` : ''}`;
        console.log(`[Scraper] Fetching Latest: ${url} (page ${page})`);
        for (const getProxyUrl of this.getProxies()) {
            try {
                const html = await this.fetchHtml(url, getProxyUrl);
                if (!html || html.length < 500) continue;

                // Detect blocked/captcha pages
                if (html.includes('you have been blocked') ||
                    html.includes('Checking your browser') ||
                    html.includes('Just a moment') ||
                    html.includes('cf-browser-verification')) {
                    console.warn(`[Scraper] Latest page blocked via ${getProxyUrl}`);
                    continue;
                }

                const $ = cheerio.load(html);
                let novels = this.parseNovelsList($, '.novel-list .novel-item, .novel-list .item, .novel-item');

                if (novels.length === 0) {
                    novels = this.parseNovelsList($, '.novel-list');
                }

                if (novels.length > 0) {
                    console.log(`[Scraper] Latest fetched ${novels.length} novels via ${getProxyUrl}`);
                    return novels;
                }
            } catch (e) {
                console.error(`[Scraper] Latest fetch failed for page ${page}`, e);
            }
        }
        return [];
    }

    async fetchRecentlyAdded(page: number = 1): Promise<NovelMetadata[]> {
        const url = `https://novelfire.net/latest-release-novels${page > 1 ? `?page=${page}` : ''}`;
        console.log(`[Scraper] Fetching Recently Added: ${url} (page ${page})`);
        for (const getProxyUrl of this.getProxies()) {
            try {
                const html = await this.fetchHtml(url, getProxyUrl);
                if (!html || html.length < 500) continue;

                // Detect blocked/captcha pages
                if (html.includes('you have been blocked') ||
                    html.includes('Checking your browser') ||
                    html.includes('Just a moment') ||
                    html.includes('cf-browser-verification')) {
                    console.warn(`[Scraper] Recently Added page blocked via ${getProxyUrl}`);
                    continue;
                }

                const $ = cheerio.load(html);
                let novels = this.parseNovelsList($, '.novel-list .novel-item, .novel-list .item, .novel-item');

                if (novels.length === 0) {
                    novels = this.parseNovelsList($, '.novel-list');
                }

                if (novels.length > 0) {
                    console.log(`[Scraper] Recently Added fetched ${novels.length} novels via ${getProxyUrl}`);
                    return novels;
                }
            } catch (e) {
                console.error(`[Scraper] Recently Added fetch failed for page ${page}`, e);
            }
        }
        return [];
    }

    async fetchCompleted(page: number = 1): Promise<NovelMetadata[]> {
        const url = `https://novelfire.net/genre-all/sort-popular/status-completed/all-novel${page > 1 ? `?page=${page}` : ''}`;
        console.log(`[Scraper] Fetching Completed: ${url} (page ${page})`);
        for (const getProxyUrl of this.getProxies()) {
            try {
                const html = await this.fetchHtml(url, getProxyUrl);
                if (!html || html.length < 500) continue;

                // Detect blocked/captcha pages
                if (html.includes('you have been blocked') ||
                    html.includes('Checking your browser') ||
                    html.includes('Just a moment') ||
                    html.includes('cf-browser-verification')) {
                    console.warn(`[Scraper] Completed page blocked via ${getProxyUrl}`);
                    continue;
                }

                const $ = cheerio.load(html);
                let novels = this.parseNovelsList($, '.novel-list .novel-item, .novel-list .item, .novel-item');

                if (novels.length === 0) {
                    novels = this.parseNovelsList($, '.novel-list');
                }

                if (novels.length > 0) {
                    console.log(`[Scraper] Completed fetched ${novels.length} novels via ${getProxyUrl}`);
                    return novels;
                }
            } catch (e) {
                console.error(`[Scraper] Completed fetch failed for page ${page}`, e);
            }
        }
        return [];
    }

    async syncAllDiscoverData(onProgress?: (task: string, current: number, total: number) => void): Promise<HomeData> {
        const results: HomeData = { recommended: [], ranking: [], latest: [], recentlyAdded: [], completed: [] };

        try {
            // 1. Fetch Ranking (Page 1)
            onProgress?.('Syncing Top Rankings...', 1, 5);
            results.ranking = await this.fetchRanking('overall', 1);

            // 2. Fetch Latest (Page 1)
            onProgress?.('Syncing Latest Updates...', 2, 5);
            results.latest = await this.fetchLatest(1);

            // 3. Fetch Completed (Page 1)
            onProgress?.('Syncing Completed Stories...', 3, 5);
            results.completed = await this.fetchCompleted(1);

            // 4. Fetch Recently Added (from /latest-release-novels)
            onProgress?.('Syncing Recently Added...', 4, 5);
            results.recentlyAdded = await this.fetchRecentlyAdded(1);

            // 5. Try to fetch deep home data for recommendations
            onProgress?.('Syncing Home Page...', 5, 5);
            try {
                const homeDeepData = await this.fetchHomeData();

                // Backfill other categories if primary fetch failed (Fallback source)
                if (results.ranking.length === 0 && homeDeepData.ranking.length > 0) {
                    console.log('[Scraper] Backfilling Ranking from Home Data');
                    results.ranking = homeDeepData.ranking;
                }
                if (results.latest.length === 0 && homeDeepData.latest.length > 0) {
                    console.log('[Scraper] Backfilling Latest from Home Data');
                    results.latest = homeDeepData.latest;
                }
                if (results.completed.length === 0 && homeDeepData.completed.length > 0) {
                    console.log('[Scraper] Backfilling Completed from Home Data');
                    results.completed = homeDeepData.completed;
                }
                // Use AJAX recently added as fallback if main fetch failed
                if (results.recentlyAdded.length === 0 && homeDeepData.recentlyAdded.length > 0) {
                    console.log('[Scraper] Backfilling Recently Added from AJAX');
                    results.recentlyAdded = homeDeepData.recentlyAdded;
                }

            } catch (e) {
                console.warn('[Scraper] Deep home fetch failed, using fallbacks', e);
            }

            // Fallback for Recently Added: Use Latest if still empty
            if (results.recentlyAdded.length === 0 && results.latest.length > 0) {
                console.log('[Scraper] Using Latest as fallback for Recently Added');
                // Take the first 10 from latest as 'recently added'
                results.recentlyAdded = [...results.latest].slice(0, 10);
            }

            // 6. Handle Recommendations (Shuffle or pick from results)
            onProgress?.('Generating Recommendations...', 5, 5);
            const allPool = [...results.ranking, ...results.latest, ...results.completed];
            // Deduplicate by title
            const uniquePool = Array.from(new Map(allPool.map(item => [item.title, item])).values());
            // Randomly pick 10 for recommendations
            results.recommended = uniquePool.sort(() => 0.5 - Math.random()).slice(0, 10);

            // Save to localStorage
            localStorage.setItem('homeData', JSON.stringify(results));
        } catch (e) {
            console.error('[Scraper] syncAllDiscoverData failed', e);
        }

        return results;
    }

    async fetchHomeData(): Promise<HomeData> {
        const urls = ['https://novelfire.net/home', 'https://novelfire.net/'];

        const results: HomeData = { recommended: [], ranking: [], latest: [], recentlyAdded: [], completed: [] };

        for (const url of urls) {
            for (const getProxyUrl of this.getProxies()) {
                try {
                    const html = await this.fetchHtml(url, getProxyUrl);

                    if (!html || html.length < 500) {
                        console.warn(`[Scraper] Suspiciously short response (${html?.length || 0} bytes)`);
                        continue;
                    }

                    const $ = cheerio.load(html);

                    const findSectionByHeading = (keywords: string[]) => {
                        let foundNovels: (NovelMetadata & { sourceUrl: string })[] = [];

                        $('h1, h2, h3, h4, h5, h6, .section-title, .title').each((_, el) => {
                            const text = $(el).text().toLowerCase();
                            if (keywords.some(k => text.includes(k))) {
                                let container = $(el).next();
                                if (container.length === 0 || container.find('a').length < 2) {
                                    container = $(el).parent().next();
                                }
                                if (container.length === 0 || container.find('a').length < 2) {
                                    container = $(el).parent();
                                }

                                const novels = this.parseNovelsList($, container);
                                if (novels.length > 2) {
                                    foundNovels = novels;
                                    return false;
                                }
                            }
                        });
                        return foundNovels;
                    };

                    const recommended = findSectionByHeading(['recommended', 'recommends', 'featured', 'hot', 'trending']) ||
                        this.parseNovelsList($, '.novel-list, .recommended-novels .item, .featured .item, .hot-novels .item, .carousel-item, [class*="recommended"] .item');

                    const ranking = findSectionByHeading(['ranking', 'top', 'rating', 'popular']) ||
                        this.parseNovelsList($, '.rank-container, .ranking-list .item, .top-rated .item, .ranking .item, [class*="ranking"] .item, [class*="top-rated"] .item');

                    const latest = findSectionByHeading(['latest', 'update', 'new']) ||
                        this.parseNovelsList($, '.novel-list, .latest-updates .item, .new-novels .item, .list-novel .item, [class*="latest"] .item, [class*="new-novels"] .item');

                    const recentlyAdded = findSectionByHeading(['recent', 'added']) ||
                        this.parseNovelsList($, '.recent-chapters .item, .recent-updates .item, [class*="recent"] .item');

                    const completed = findSectionByHeading(['completed', 'full', 'stories']) ||
                        this.parseNovelsList($, '.novel-list, .completed-stories .item, .completed .item, [class*="completed"] .item');

                    if (recommended.length > 0 && results.recommended.length === 0) results.recommended = recommended.slice(0, 10);
                    if (ranking.length > 0 && results.ranking.length === 0) results.ranking = ranking.slice(0, 15);
                    if (latest.length > 0 && results.latest.length === 0) results.latest = latest.slice(0, 15);
                    if (recentlyAdded.length > 0 && results.recentlyAdded.length === 0) results.recentlyAdded = recentlyAdded.slice(0, 15);
                    if (completed.length > 0 && results.completed.length === 0) results.completed = completed.slice(0, 15);

                    if (results.recommended.length === 0 && results.latest.length === 0) {
                        const broadNovels = this.parseNovelsList($, '.item, .col-6, .box, .list-row, .novel-item, .book-item, [class*="novel"], [class*="book"]');

                        if (broadNovels.length > 0) {
                            if (results.recommended.length === 0) results.recommended = broadNovels.slice(0, 5);
                            if (results.ranking.length === 0) results.ranking = broadNovels.slice(5, 15);
                            if (results.latest.length === 0) results.latest = broadNovels.slice(15, 25);
                            if (results.completed.length === 0) results.completed = broadNovels.slice(25, 35);
                        } else {
                            const allLinks = this.parseNovelsList($, 'a[href*="/book/"], a[href*="/novel/"]').slice(0, 20);
                            if (allLinks.length > 0) {
                                results.latest = allLinks;
                            }
                        }
                    }

                    // If we found significant data, we can stop
                    if (results.recommended.length > 2 || results.latest.length > 2 || results.ranking.length > 2) {
                        console.log(`[Scraper] Successfully found data on ${url} via proxy`);
                        break;
                    }
                } catch (error) {
                    console.error(`[Scraper] Failed to fetch home data from ${url} with proxy`, error);
                }
            }
            if (results.recommended.length > 2 || results.latest.length > 2) {
                console.log(`[Scraper] Found sufficient data, breaking loop. Recommended: ${results.recommended.length}, Latest: ${results.latest.length}`);
                break;
            }
        }

        console.log(`[Scraper] Finished home page loop. Now fetching recently added...`);

        // 5. Fetch Recently Added via AJAX (since it's loaded dynamically on the site)
        try {
            const ajaxUrl = 'https://novelfire.net/ajax/latestReleaseNovel';
            console.log(`[Scraper] Fetching AJAX content from ${ajaxUrl}`);

            for (const getProxyUrl of this.getProxies()) {
                try {
                    // AJAX often requires this header (handled in fetchHtml via url check)
                    const jsonStr = await this.fetchHtml(ajaxUrl, getProxyUrl);
                    console.log(`[Scraper] AJAX Raw Response (first 100 chars): ${jsonStr.substring(0, 100)}`);
                    // The proxy might return the JSON directly or wrapped. 
                    // If it's pure JSON:
                    let htmlContent = '';

                    try {
                        const data = JSON.parse(jsonStr) as { html?: string };
                        if (data && data.html) {
                            htmlContent = data.html;
                        }
                    } catch {
                        // Maybe it returned raw HTML if the proxy unwrapped it weirdly, or it failed
                        if (jsonStr.includes('<li') || jsonStr.includes('class="novel-item"')) {
                            htmlContent = jsonStr;
                        }
                    }

                    if (htmlContent) {
                        const $ajax = cheerio.load(htmlContent);
                        const recentNovels = this.parseNovelsList($ajax, '.novel-item, .item');
                        if (recentNovels.length > 0) {
                            results.recentlyAdded = recentNovels;
                            console.log(`[Scraper] Successfully fetched ${recentNovels.length} recently added novels via AJAX`);
                            break;
                        }
                    }
                } catch (ajaxErr) {
                    console.warn(`[Scraper] AJAX fetch failed with proxy`, ajaxErr);
                }
            }
        } catch (e) {
            console.error('[Scraper] Failed to fetch recently added AJAX', e);
        }

        // Fallback: If AJAX failed, use Latest novels for Recently Added
        if (results.recentlyAdded.length === 0 && results.latest.length > 0) {
            console.log('[Scraper] AJAX failed, using Latest novels as fallback for Recently Added');
            results.recentlyAdded = [...results.latest];
        }

        const dedupe = (arr: NovelMetadata[]) => {
            const seen = new Set();
            return arr.filter(item => {
                if (!item.title) return false;
                const k = item.title.toLowerCase();
                if (seen.has(k)) return false;
                seen.add(k);
                return true;
            });
        };

        results.recommended = dedupe(results.recommended);
        results.ranking = dedupe(results.ranking);
        results.latest = dedupe(results.latest);
        results.recentlyAdded = dedupe(results.recentlyAdded);
        results.completed = dedupe(results.completed);

        return results;
    }

}

export const scraperService = new ScraperService();

