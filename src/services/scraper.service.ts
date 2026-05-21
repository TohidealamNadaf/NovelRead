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
    chapters: ScrapedChapter[];
    publishers?: string[];
    selectedPublisher?: string;
    sourceUrl?: string; // For search results to link back to source
    sourceId?: string; // Original ID from source
}

export type ScrapedChapter = { title: string; url: string; date?: string };

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
    // Deduplication: prevent concurrent fetchNovelFast calls for the same URL
    private _pendingFetches = new Map<string, Promise<NovelMetadata>>();

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

        // 1. Remove leading standalone numeric index ONLY when followed by a chapter title
        // e.g., "1 Chapter 1" → "Chapter 1", but keep "Chapter 1" as-is
        cleaned = cleaned.replace(/^\d+[\s\.\-]+(Chapter\b)/gi, '$1');

        // 2. Remove timestamps (e.g., "1 day ago", "3 years ago")
        // CRITICAL: Cheerio often concatenates adjacent text nodes without spaces,
        // e.g., "Chapter 101" + "1 year ago" becomes "Chapter 1011 year ago".
        // A naive regex would match "1011 year ago" and destroy the chapter number.
        // Strategy: Match timestamp only when preceded by a non-digit or start of string,
        // and try from the rightmost match to avoid eating chapter digits.
        const timestampRegex = /(?<=\D|^)\d{1,2}\s*(minute|hour|day|week|month|year)s?\s*ago/gi;
        cleaned = cleaned.replace(timestampRegex, '');

        // 3. Remove common UI labels/artifacts
        cleaned = cleaned.replace(/(NEW|HOT|FREE|UPDATED)$/gi, '');

        // 4. Normalize whitespace
        cleaned = cleaned.replace(/\s+/g, ' ').trim();

        return cleaned;
    }

    /**
     * Cleans synopsis/summary text by removing embedded "show more" / "read more"
     * link text that gets scraped from the source website.
     */
    cleanSummary(text: string): string {
        if (!text) return '';
        // Remove trailing "Show more", "Read more", "See more", "View more", "Less", "Show less", etc.
        let cleaned = text
            .replace(/\s*(show\s*more|read\s*more|see\s*more|view\s*more|show\s*less|read\s*less|see\s*less|view\s*less|\.\.\.\s*more|\.\.\.\s*less|\.{3,}\s*$)\s*$/gi, '')
            .replace(/\s*(show\s*more|read\s*more|see\s*more|view\s*more)\s*/gi, '')  // Also catch mid-text occurrences
            .trim();
        // Remove trailing ellipsis artifacts left after stripping
        cleaned = cleaned.replace(/\s*\.{3,}\s*$/, '').trim();
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

    private extractChaptersFromPage($: cheerio.CheerioAPI, baseUrl: string): ScrapedChapter[] {
        const chapters: ScrapedChapter[] = [];
        const seenLinks = new Set<string>();
        const origin = 'https://novelfire.net';

        // PRIMARY: novelfire.net specific - ul.chapter-list li a with strong.chapter-title and time.chapter-update
        // Structure: <li><a href="/book/.../chapter-N"><span class="chapter-no">N</span><strong class="chapter-title">Title</strong><time class="chapter-update">X ago</time></a></li>
        const novelFireItems = $('ul.chapter-list li, .chapter-list li');
        if (novelFireItems.length > 0) {
            novelFireItems.each((_, el) => {
                const anchor = $(el).find('a').first();
                if (!anchor.length) return;

                const link = anchor.attr('href') || anchor.attr('title') && '';
                if (!link) return;

                // Get title from strong.chapter-title, fallback to anchor[title], fallback to full text
                const titleEl = anchor.find('strong.chapter-title, .chapter-title').first();
                let rawTitle = titleEl.length ? titleEl.text().trim() : '';
                if (!rawTitle) rawTitle = anchor.attr('title')?.trim() || '';
                if (!rawTitle) {
                    // Clone, remove time element, get text
                    const clone = anchor.clone();
                    clone.find('time, .chapter-update, .chapter-no').remove();
                    rawTitle = clone.text().trim();
                }

                const dateEl = anchor.find('time.chapter-update, time, .chapter-update').first();
                const chapterDate = dateEl.length ? dateEl.text().trim() : undefined;

                const cleanTitle = this.cleanChapterTitle(rawTitle);
                const fullUrl = link.startsWith('http') ? link : `${origin}${link.startsWith('/') ? '' : '/'}${link}`;

                let finalTitle = cleanTitle;
                // If no meaningful title, extract from URL
                if (!finalTitle || /^Chapter$/i.test(finalTitle)) {
                    const urlMatch = fullUrl.match(/chapter[_\-]?(\d+)/i);
                    if (urlMatch) finalTitle = `Chapter ${urlMatch[1]}`;
                }

                if (this.isValidChapterTitle(finalTitle) && !seenLinks.has(fullUrl)) {
                    chapters.push({ title: finalTitle, url: fullUrl, date: chapterDate });
                    seenLinks.add(fullUrl);
                }
            });

            if (chapters.length > 0) return chapters;
        }

        // FALLBACK: Generic selectors for other novel sites
        const genericSelectors = [
            'ul.list-chapter li', '#chapter-list li', '.chapters li',
            '#list-chapter .row', '.list-item', '.chapter-item'
        ];

        for (const sel of genericSelectors) {
            const items = $(sel);
            if (items.length > 0) {
                items.each((_, el) => {
                    const anchor = $(el).find('a').first();
                    if (anchor.length === 0) return;

                    const link = anchor.attr('href');
                    if (!link) return;

                    const dateSelectors = 'time, [class*="time"], [class*="date"], [class*="ago"], [class*="update"], small, .text-muted';
                    const dateEl = anchor.find(dateSelectors).first();
                    let chapterDate: string | undefined;
                    if (dateEl.length > 0) chapterDate = dateEl.text().trim() || undefined;

                    const clonedAnchor = anchor.clone();
                    clonedAnchor.find(dateSelectors).remove();
                    let rawTitle = clonedAnchor.text().trim();

                    if (!chapterDate && rawTitle) {
                        const timestampRegex = /(\d{1,2}\s*(minute|hour|day|week|month|year)s?\s*ago)/gi;
                        const fullText = anchor.text();
                        const dateMatch = fullText.match(timestampRegex);
                        if (dateMatch) {
                            chapterDate = dateMatch[dateMatch.length - 1].trim();
                            rawTitle = rawTitle.replace(timestampRegex, '').trim();
                        }
                    }

                    if (!rawTitle) rawTitle = anchor.text().trim();

                    const cleanTitle = this.cleanChapterTitle(rawTitle);
                    const fullUrl = this.resolveUrl(baseUrl, link);

                    let finalTitle = cleanTitle;
                    if (/^Chapter$/i.test(finalTitle)) {
                        const urlMatch = fullUrl.match(/chapter[_\-]?(\d+)/i);
                        if (urlMatch) finalTitle = `Chapter ${urlMatch[1]}`;
                    }

                    if (this.isValidChapterTitle(finalTitle) && !seenLinks.has(fullUrl)) {
                        chapters.push({ title: finalTitle, url: fullUrl, date: chapterDate });
                        seenLinks.add(fullUrl);
                    }
                });
                if (chapters.length > 0) break;
            }
        }

        // LAST RESORT: Scan all chapter-like links
        if (chapters.length === 0) {
            $('a').each((_, el) => {
                const anchor = $(el);
                const link = anchor.attr('href');
                if (!link || (!link.includes('/chapter') && !link.includes('ch-'))) return;

                const dateSelectors = 'time, [class*="time"], [class*="date"], [class*="ago"], [class*="update"], small';
                const clonedAnchor = anchor.clone();
                clonedAnchor.find(dateSelectors).remove();
                let rawTitle = clonedAnchor.text().trim() || anchor.attr('title')?.trim() || anchor.text().trim();

                const cleanTitle = this.cleanChapterTitle(rawTitle);
                const fullUrl = this.resolveUrl(baseUrl, link);

                let finalTitle = cleanTitle;
                if (/^Chapter$/i.test(finalTitle)) {
                    const urlMatch = fullUrl.match(/chapter[_\-]?(\d+)/i);
                    if (urlMatch) finalTitle = `Chapter ${urlMatch[1]}`;
                }

                if (this.isValidChapterTitle(finalTitle) && !seenLinks.has(fullUrl)) {
                    chapters.push({ title: finalTitle, url: fullUrl });
                    seenLinks.add(fullUrl);
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

        // Generate a stable novel ID from the URL if possible, otherwise use title-based slug
        let novelId = '';
        if (url) {
            const path = url.replace(/https?:\/\/[^\/]+/, '').replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
            novelId = `live-${path}`.slice(0, 80);
        } else {
            novelId = novel.title.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '-').toLowerCase().slice(0, 24) + '-' + Math.random().toString(36).slice(2, 7);
        }

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
        const BATCH_SIZE = 3;

        for (let i = 0; i < chapters.length; i += BATCH_SIZE) {
            const batch = chapters.slice(i, i + BATCH_SIZE);

            // Process batch in parallel
            await Promise.all(batch.map(async (ch, batchIndex) => {
                const globalIndex = i + batchIndex;
                const currentIndex = offset + globalIndex + 1;

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
                    return;
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
                            orderIndex: offset + globalIndex, // 0-based storage
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
            }));

            if (i + BATCH_SIZE < chapters.length) {
                await new Promise(resolve => setTimeout(resolve, 1500));
            }
        }
    }

    /**
     * Optimized novel fetcher for live browsing (NovelDetail page).
     * Key optimizations over fetchNovel:
     *  - Locks in the first working proxy and reuses it for all pages
     *  - No artificial delays between chapter pages
     *  - Supports onProgress callback for incremental UI updates
     */
    async fetchNovelFast(
        url: string,
        onProgress?: (chapters: { title: string; url: string; date?: string }[], page: number, metadata?: Partial<NovelMetadata>) => void
    ): Promise<NovelMetadata> {
        // Deduplication: if the same URL is already being fetched, reuse that promise
        const normalizedUrl = url.replace(/\/chapters\/?(\\?.*)?$/, '');
        const existingFetch = this._pendingFetches.get(normalizedUrl);
        if (existingFetch) {
            console.log(`[Scraper:Fast] Deduplicating request for ${normalizedUrl}`);
            return existingFetch;
        }

        const fetchPromise = this._fetchNovelFastInternal(url, onProgress);
        this._pendingFetches.set(normalizedUrl, fetchPromise);

        try {
            return await fetchPromise;
        } finally {
            this._pendingFetches.delete(normalizedUrl);
        }
    }

    private async _fetchNovelFastInternal(
        url: string,
        onProgress?: (chapters: { title: string; url: string; date?: string }[], page: number, metadata?: Partial<NovelMetadata>) => void
    ): Promise<NovelMetadata> {
        const infoUrl = url.replace(/\/chapters\/?(\\?.*)?$/, '');
        let listUrl = url;
        const userProvidedChapters = /\/chapters\/?(\\?.*)?$/.test(url);

        let title = '', author = '', coverUrl = '', summary = '', status = 'Ongoing';
        let workingProxy: string | undefined;

        // 1. Fetch Metadata — find a working proxy and lock it in
        for (const proxyUrl of this.getProxies()) {
            try {
                const html = await this.fetchHtml(infoUrl, proxyUrl);
                if (!html) continue;

                const $ = cheerio.load(html);

                // NovelFire detail page selectors:
                // Title: h1[itemprop="name"] or h1.novel-title or og:title
                const extractedTitle = (
                    $('h1[itemprop="name"]').text().trim() ||
                    $('h1.novel-title').text().trim() ||
                    $('h1').first().text().trim() ||
                    $('meta[property="og:title"]').attr('content') || ''
                ).split(' Novel - Read')[0].split(' - Novel Fire')[0].trim();

                if (extractedTitle) {
                    title = extractedTitle;

                    // Author: span[itemprop="author"] inside .author
                    author = (
                        $('span[itemprop="author"]').first().text().trim() ||
                        $('.author a').first().text().trim() ||
                        $('.author').text().replace('Author:', '').trim() ||
                        'Unknown'
                    );

                    // Summary: Extract actual synopsis text, avoid generic SEO meta description
                    let extractedSummary = (
                        $('.summary .content').text().trim() ||
                        $('.summary').text().replace(/^Summary\s*/i, '').trim() ||
                        $('.summary__content').text().trim() ||
                        $('.description').text().trim() ||
                        $('#editdescription').text().trim() ||
                        $('.book-info-desc').text().trim() ||
                        $('.content').first().text().trim()
                    );

                    if (!extractedSummary) {
                        const metaDesc = $('meta[name="description"]').attr('content') || '';
                        if (!metaDesc.toLowerCase().includes('novel online free')) {
                            extractedSummary = metaDesc;
                        }
                    }
                    summary = this.cleanSummary(extractedSummary);

                    // Status: strong.ongoing or strong.status inside header-stats
                    status = (
                        $('strong.ongoing').first().text().trim() ||
                        $('strong.status').first().text().trim() ||
                        $('.header-stats strong').last().text().trim() ||
                        'Ongoing'
                    );

                    // Cover: meta[property="og:image"] is most reliable (full absolute URL)
                    let extractedCover = $('meta[property="og:image"]').attr('content') || '';
                    if (!extractedCover) {
                        // Fallback: figure.novel-cover img or .cover img
                        const imgEl = $('figure.novel-cover img, .novel-cover img, .cover img, .book-cover img').first();
                        extractedCover = imgEl.attr('src') || imgEl.attr('data-src') || imgEl.attr('data-lazy-src') || '';
                    }

                    if (extractedCover && !extractedCover.startsWith('http')) {
                        if (extractedCover.startsWith('//')) extractedCover = `https:${extractedCover}`;
                        else {
                            if (!extractedCover.startsWith('/')) extractedCover = '/' + extractedCover;
                            extractedCover = `https://novelfire.net${extractedCover}`;
                        }
                    }
                    coverUrl = extractedCover;

                    // Yield metadata early so Synopsis/Summary shows up
                    onProgress?.([], 0, { title, author, summary, status, coverUrl });

                    if (!userProvidedChapters) {
                        // NovelFire chapters page: /book/{slug}/chapters
                        const chaptersLink = $('a[href*="/chapters"]').first().attr('href');
                        if (chaptersLink) {
                            const origin = new URL(infoUrl).origin;
                            listUrl = chaptersLink.startsWith('http') ? chaptersLink : `${origin}${chaptersLink.startsWith('/') ? '' : '/'}${chaptersLink}`;
                        } else {
                            // Derive chapters URL from info URL
                            listUrl = infoUrl.replace(/\/$/, '') + '/chapters';
                        }
                    }

                    workingProxy = proxyUrl;
                    break;
                }
            } catch (e) {
                console.warn(`[Scraper:Fast] Metadata fetch failed`, e);
            }
        }

        // 2. Scrape Chapters — reuse locked proxy, no delays
        const allChapters: { title: string; url: string }[] = [];
        const visitedUrls = new Set<string>();
        let pageCount = 0;
        const MAX_PAGES = 50;
        let currentUrl = listUrl;

        // Build a short proxy list: working proxy first, then fallbacks
        const proxyOrder = workingProxy
            ? [workingProxy, ...this.getProxies().filter(p => p !== workingProxy)]
            : this.getProxies();

        while (currentUrl && !visitedUrls.has(currentUrl) && pageCount < MAX_PAGES) {
            visitedUrls.add(currentUrl);
            pageCount++;
            let pageFound = false;

            for (const proxyUrl of proxyOrder) {
                try {
                    const html = await this.fetchHtml(currentUrl, proxyUrl);
                    if (!html || html.length < 500) continue;
                    if (html.includes('you have been blocked') || html.includes('Checking your browser') ||
                        html.includes('Just a moment') || html.includes('cf-browser-verification')) continue;

                    const $ = cheerio.load(html);
                    const newChapters = this.extractChaptersFromPage($, currentUrl);

                    for (const ch of newChapters) {
                        if (!allChapters.some(c => c.url === ch.url)) {
                            allChapters.push(ch);
                        }
                    }

                    // Notify UI of incremental progress
                    onProgress?.(allChapters, pageCount, {
                        title,
                        author,
                        summary,
                        status,
                        coverUrl
                    });

                    const nextPage = this.findNextPage($, currentUrl);
                    currentUrl = nextPage && !visitedUrls.has(nextPage) ? nextPage : '';
                    pageFound = true;

                    // If this proxy worked, promote it for next iteration
                    if (proxyUrl !== proxyOrder[0]) {
                        workingProxy = proxyUrl;
                    }
                    break; // Got data, move to next page
                } catch (e) {
                    console.warn(`[Scraper:Fast] Chapter page ${pageCount} failed with proxy`, e);
                }
            }

            if (!pageFound) break;
            // Small delay between pages to avoid 429 rate limiting from CORS proxies
            if (pageCount > 0) {
                await new Promise(resolve => setTimeout(resolve, 300));
            }
        }

        if (!title && allChapters.length === 0) {
            throw new Error('Failed to fetch novel metadata and chapters. Device might be offline or source is blocking requests.');
        }

        return {
            title: title || 'Unknown Title',
            author: author || 'Unknown Author',
            coverUrl, summary, status,
            chapters: allChapters
        };
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
            // NovelFire detail page selectors (verified against live HTML):
            // Title: h1[itemprop="name"] or h1.novel-title or og:title
            const extractedTitle = (
                $('h1[itemprop="name"]').text().trim() ||
                $('h1.novel-title').text().trim() ||
                $('h1').first().text().trim() ||
                $('meta[property="og:title"]').attr('content') || ''
            ).split(' Novel - Read')[0].split(' - Novel Fire')[0].trim();

            // Author: span[itemprop="author"] inside .author
            const extractedAuthor = (
                $('span[itemprop="author"]').first().text().trim() ||
                $('.author a').first().text().trim() ||
                $('.author').text().replace('Author:', '').trim() ||
                'Unknown'
            );

            // Summary: Extract actual synopsis text, avoid generic SEO meta description
            let extractedSummary = (
                $('.summary .content').text().trim() ||
                $('.summary').text().replace(/^Summary\s*/i, '').trim() ||
                $('.summary__content').text().trim() ||
                $('.description').text().trim() ||
                $('#editdescription').text().trim() ||
                $('.book-info-desc').text().trim() ||
                $('.content').first().text().trim()
            );

            if (!extractedSummary) {
                const metaDesc = $('meta[name="description"]').attr('content') || '';
                if (!metaDesc.toLowerCase().includes('novel online free')) {
                    extractedSummary = metaDesc;
                }
            }
            const cleanedSummary = this.cleanSummary(extractedSummary);

            // Status: strong.ongoing in header-stats
            const extractedStatus = (
                $('strong.ongoing').first().text().trim() ||
                $('strong.status').first().text().trim() ||
                $('.header-stats strong').last().text().trim() ||
                'Ongoing'
            );

            // Cover: og:image is most reliable (full absolute URL)
            let extractedCover = $('meta[property="og:image"]').attr('content') || '';
            if (!extractedCover) {
                const imgEl = $('figure.novel-cover img, .novel-cover img, .cover img, .book-cover img').first();
                extractedCover = imgEl.attr('src') || imgEl.attr('data-src') || imgEl.attr('data-lazy-src') || '';
            }

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
                summary: cleanedSummary,
                status: extractedStatus
            };
        };

        // Attempt metadata fetch
        for (const getProxyUrl of this.getProxies()) {
            try {
                const html = await this.fetchHtml(infoUrl, getProxyUrl);
                if (!html) continue;

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
                        } else {
                            // Derive chapters URL: /book/{slug}/chapters
                            listUrl = infoUrl.replace(/\/$/, '') + '/chapters';
                        }
                    }
                    break;
                }
            } catch (e) {
                console.warn(`[Scraper] Metadata fetch failed`, e);
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
                    if (!html) continue;

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

        if (!title && allChapters.length === 0) {
            throw new Error('Failed to fetch novel metadata and chapters. Device might be offline or source is blocking requests.');
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

                // Enhanced Thought Regex: Handles standard quotes ' ' and smart quotes ‘ ’
                // Looks for opening quote (start of line, space, or standard punctuation before)
                // Captures contents (at least 2 chars, non-greedy)
                // Looks for closing quote (followed by end of line, space, or standard punctuation)
                text = text.replace(/(^|\s|[([<])(['‘])(.*?)(['’])(?=$|\s|[.,;:?!\])>])/g, function (match, p1, p2, p3, p4) {
                    // Prevent replacing text that looks like a contraction (e.g., 'tis) or plural possessives (e.g., dogs')
                    // by ensuring there's actual content and it doesn't immediately touch word characters illegally
                    if (p3.trim().length > 1) {
                        return `${p1}<span class="smart-thought">${p2}${p3}${p4}</span>`;
                    }
                    return match;
                });

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
            console.warn('[Scraper] Device is offline, skipping fetchHtml');
            return '';
        }

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
            } else if (proxyUrl.startsWith('/api/proxy')) {
                finalUrl = `/api/proxy?url=${encodeURIComponent(url)}`;
            } else {
                finalUrl = `${proxyUrl}${encodeURIComponent(url)}`;
            }
        }

        const proxyName = proxyUrl
            ? (proxyUrl.startsWith('/') ? 'vite-proxy' : (proxyUrl.split('/')[2] || 'direct'))
            : 'direct';

        try {
            console.log(`[Scraper] Trying via ${proxyName} for URL: ${url.substring(0, 100)}...`);

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
                    console.warn(`[Scraper] ✗ HTTP ${response.status} via ${proxyName}`);
                    return '';
                }
            } else {
                // For native or direct full URL, use CapacitorHttp mimicking a real mobile browser
                const options = {
                    url: finalUrl,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.6167.178 Mobile Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.5',
                        'Referer': url.includes('novelfire.net') ? 'https://novelfire.net/' : 'https://google.com',
                    },
                    connectTimeout: 30000,
                    readTimeout: 30000
                };

                const response = await CapacitorHttp.get(options);

                if (response.status === 200 && response.data) {
                    if (proxyUrl && proxyUrl.includes('allorigins.win')) {
                        try {
                            const json = JSON.parse(response.data);
                            html = json.contents || '';
                        } catch {
                            html = String(response.data || '');
                        }
                    } else if (typeof response.data === 'object') {
                        html = JSON.stringify(response.data);
                    } else {
                        html = String(response.data || '');
                    }
                } else {
                    console.warn(`[Scraper] ✗ HTTP ${response.status} via ${proxyName}`);
                    if (response.status === 429) {
                        console.warn(`[Scraper] Rate limited (429), backing off 2s before next proxy...`);
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    }
                    return '';
                }
            }

            // Validate HTML content
            if (this.isValidHtml(html)) {
                console.log(`[Scraper] ✓ Got valid HTML (${html.length} chars) via ${proxyName}`);
                return html;
            } else {
                console.warn(`[Scraper] ✗ Blocked/challenge page via ${proxyName}`);
            }
        } catch (error) {
            console.warn(`[Scraper] ✗ Fetch error via ${proxyName}:`, error);
        }

        return '';
    }

    getProxies(): string[] {
        const isNative = Capacitor.isNativePlatform();

        if (isNative) {
            // Direct first for native (no CORS), then fallbacks
            return [
                '', // Direct fetch
                'https://api.codetabs.com/v1/proxy?quest=',
                'https://corsproxy.io/?url=',
            ];
        }

        // Web: use Vite dev proxy to bypass CORS entirely
        return [
            '/api/proxy?url=',
        ];
    }

    /**
     * Parse a list of novels from novelfire.net HTML.
     * NovelFire uses li.novel-item with cover in figure img[data-src],
     * title in h2.title or h4.novel-title, URL in a[href*="/book/"].
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private parseNovelsList($: cheerio.CheerioAPI, selector: any): (NovelMetadata & { sourceUrl: string })[] {
        const novels: (NovelMetadata & { sourceUrl: string })[] = [];
        const origin = 'https://novelfire.net';

        // Get novel item elements
        let items = $(selector);
        // If the selector returned a container (not individual items), find novel-items inside
        if (items.length === 1 && !items.hasClass('novel-item')) {
            items = items.find('li.novel-item, .novel-item');
        }
        // If still a broad selection, try to find individual novel-items
        if (items.length === 0) {
            items = $('li.novel-item');
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        items.each((_: number, el: any) => {
            const $el = $(el);

            // Title: novelfire uses h2.title > a or h4.novel-title > text, or a[title]
            let title = $el.find('h2.title a, h4.novel-title, h3.novel-title, h2.novel-title').first().text().trim();
            if (!title) title = $el.find('h1, h2, h3, h4, h5').first().text().trim();
            if (!title) title = $el.find('.cover-wrap a, .cover-wrap figure a').first().attr('title')?.trim() || '';
            if (!title) title = $el.find('a[href*="/book/"]').first().attr('title')?.trim() || '';
            if (!title) title = $el.find('a').first().text().trim();

            // URL: prioritize /book/ links (novelfire uses /book/ not /novel/)
            let url = $el.find('a[href*="/book/"]').first().attr('href') || '';
            if (!url) url = $el.find('a').first().attr('href') || '';

            if (url && !url.startsWith('http')) {
                if (!url.startsWith('/')) url = '/' + url;
                url = `${origin}${url}`;
            }

            // Cover image: novelfire uses data-src (lazy-loaded), src is a base64 placeholder
            const imgEl = $el.find('img').first();
            let coverUrl = imgEl.attr('data-src') ||
                imgEl.attr('data-lazy-src') ||
                imgEl.attr('data-original') ||
                imgEl.attr('src') || '';

            // Skip base64 placeholder images and pick data-src
            if (coverUrl && coverUrl.startsWith('data:')) {
                coverUrl = imgEl.attr('data-src') || imgEl.attr('data-lazy-src') || imgEl.attr('data-original') || '';
            }

            if (coverUrl) {
                if (coverUrl.startsWith('//')) {
                    coverUrl = `https:${coverUrl}`;
                } else if (!coverUrl.startsWith('http')) {
                    if (!coverUrl.startsWith('/')) coverUrl = '/' + coverUrl;
                    coverUrl = `${origin}${coverUrl}`;
                }
            }

            // Status: in .status or strong.ongoing
            const status = $el.find('.status, strong.ongoing, .status-group .status').first().text().trim() || 'Ongoing';

            // Only include if we have a valid novelfire /book/ URL
            if (title && url && url.includes('/book/')) {
                novels.push({
                    title,
                    author: 'Unknown', // Author not available in listing cards
                    coverUrl,
                    summary: '',
                    status,
                    sourceUrl: url,
                    chapters: []
                });
            }
        });

        // Deduplicate by sourceUrl
        const seen = new Set<string>();
        return novels.filter(novel => {
            if (seen.has(novel.sourceUrl)) return false;
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

        if (page > 1) url += `?page=${page}`;

        console.log(`[Scraper] Fetching Ranking: ${url} (page ${page})`);

        for (const proxyUrl of this.getProxies()) {
            try {
                const html = await this.fetchHtml(url, proxyUrl);
                if (!html) continue;
                const $ = cheerio.load(html);
                // novelfire ranking page has li.novel-item elements directly
                const novels = this.parseNovelsList($, 'li.novel-item');
                if (novels.length > 0) {
                    console.log(`[Scraper] Ranking fetched ${novels.length} novels`);
                    return novels;
                }
            } catch (e) {
                console.error(`[Scraper] Ranking fetch failed`, e);
            }
        }
        return [];
    }

    async fetchLatest(page: number = 1): Promise<NovelMetadata[]> {
        const url = `https://novelfire.net/genre-all/sort-new/status-all/all-novel${page > 1 ? `?page=${page}` : ''}`;
        console.log(`[Scraper] Fetching Latest: ${url}`);
        for (const proxyUrl of this.getProxies()) {
            try {
                const html = await this.fetchHtml(url, proxyUrl);
                if (!html) continue;
                const $ = cheerio.load(html);
                const novels = this.parseNovelsList($, 'li.novel-item');
                if (novels.length > 0) {
                    console.log(`[Scraper] Latest fetched ${novels.length} novels`);
                    return novels;
                }
            } catch (e) {
                console.error(`[Scraper] Latest fetch failed`, e);
            }
        }
        return [];
    }

    async fetchRecentlyAdded(page: number = 1): Promise<NovelMetadata[]> {
        const url = `https://novelfire.net/latest-release-novels${page > 1 ? `?page=${page}` : ''}`;
        console.log(`[Scraper] Fetching Recently Added: ${url}`);
        for (const proxyUrl of this.getProxies()) {
            try {
                const html = await this.fetchHtml(url, proxyUrl);
                if (!html) continue;
                const $ = cheerio.load(html);
                const novels = this.parseNovelsList($, 'li.novel-item');
                if (novels.length > 0) {
                    console.log(`[Scraper] Recently Added fetched ${novels.length} novels`);
                    return novels;
                }
            } catch (e) {
                console.error(`[Scraper] Recently Added fetch failed`, e);
            }
        }
        return [];
    }

    async fetchCompleted(page: number = 1): Promise<NovelMetadata[]> {
        const url = `https://novelfire.net/genre-all/sort-popular/status-completed/all-novel${page > 1 ? `?page=${page}` : ''}`;
        console.log(`[Scraper] Fetching Completed: ${url}`);
        for (const proxyUrl of this.getProxies()) {
            try {
                const html = await this.fetchHtml(url, proxyUrl);
                if (!html) continue;
                const $ = cheerio.load(html);
                const novels = this.parseNovelsList($, 'li.novel-item');
                if (novels.length > 0) {
                    console.log(`[Scraper] Completed fetched ${novels.length} novels`);
                    return novels;
                }
            } catch (e) {
                console.error(`[Scraper] Completed fetch failed`, e);
            }
        }
        return [];
    }

    async searchNovels(query: string): Promise<NovelMetadata[]> {
        const url = `https://novelfire.net/search?keyword=${encodeURIComponent(query)}`;
        console.log(`[Scraper] Searching novels: ${url}`);

        for (const proxyUrl of this.getProxies()) {
            try {
                const html = await this.fetchHtml(url, proxyUrl);
                if (!html) continue;

                const $ = cheerio.load(html);
                // novelfire search results use li.novel-item elements
                const novels = this.parseNovelsList($, 'li.novel-item');

                if (novels.length > 0) {
                    console.log(`[Scraper] Search found ${novels.length} novels`);
                    return novels;
                }
            } catch (e) {
                console.error(`[Scraper] Search failed`, e);
            }
        }
        return [];
    }

    async syncAllDiscoverData(onProgress?: (task: string, current: number, total: number) => void): Promise<HomeData> {
        const results: HomeData = { recommended: [], ranking: [], latest: [], recentlyAdded: [], completed: [] };

        try {
            // 1. Fetch Ranking (Top Novels)
            onProgress?.('Syncing Top Rankings...', 1, 4);
            results.ranking = await this.fetchRanking('overall', 1);

            // 2. Fetch Latest Updates
            onProgress?.('Syncing Latest Updates...', 2, 4);
            results.latest = await this.fetchLatest(1);

            // 3. Fetch Completed Stories
            onProgress?.('Syncing Completed Stories...', 3, 4);
            results.completed = await this.fetchCompleted(1);

            // 4. Fetch Recently Added (from /latest-release-novels)
            onProgress?.('Syncing Recently Added...', 4, 4);
            results.recentlyAdded = await this.fetchRecentlyAdded(1);

            // Fallback: if recentlyAdded is empty, use latest
            if (results.recentlyAdded.length === 0 && results.latest.length > 0) {
                console.log('[Scraper] Using Latest as fallback for Recently Added');
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

