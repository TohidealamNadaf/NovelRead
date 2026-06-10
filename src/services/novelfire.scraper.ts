import type { INovelScraper } from './scraper.interface';
import { BaseScraper } from './base.scraper';
import type { HomeData, NovelMetadata, ScrapedChapter } from './scraper.service';
import * as cheerio from 'cheerio';

export class NovelFireScraper extends BaseScraper implements INovelScraper {

    async searchNovels(query: string): Promise<NovelMetadata[]> {
        const url = `https://novelfire.net/search?keyword=${encodeURIComponent(query)}`;
        console.log(`[NovelFire] Searching: ${url}`);
        
        for (const proxyUrl of this.getProxies()) {
            try {
                const html = await this.fetchHtml(url, proxyUrl);
                if (!html) continue;

                const $ = cheerio.load(html);
                const novels: NovelMetadata[] = [];

                $('.novel-item, .list-novel .row').each((_, el) => {
                    const $el = $(el);
                    
                    let novelUrl = $el.find('a').first().attr('href') || '';
                    let title = $el.find('.novel-title').first().text().trim() || $el.find('h3').first().text().trim() || $el.find('a').first().attr('title')?.trim() || '';
                    if (!title) return;

                    if (novelUrl && !novelUrl.startsWith('http')) {
                        const origin = new URL(url).origin;
                        novelUrl = `${origin}${novelUrl.startsWith('/') ? '' : '/'}${novelUrl}`;
                    }

                    let coverUrl = $el.find('img.cover').first().attr('src') || $el.find('img').first().attr('data-src') || $el.find('img').first().attr('src') || '';
                    if (coverUrl && !coverUrl.startsWith('http')) {
                        if (coverUrl.startsWith('//')) coverUrl = `https:${coverUrl}`;
                        else coverUrl = `https://novelfire.net${coverUrl.startsWith('/') ? '' : '/'}${coverUrl}`;
                    }

                    const status = $el.find('.status').first().text().trim() || 'Ongoing';

                    if (novelUrl) {
                        novels.push({
                            title,
                            author: 'Unknown',
                            coverUrl,
                            status,
                            sourceUrl: novelUrl,
                            chapters: []
                        });
                    }
                });

                if (novels.length > 0) return novels;
            } catch (e) {
                console.warn(`[NovelFire] Search failed via proxy`, e);
            }
        }
        return [];
    }

    async syncDiscoverData(onProgress?: (task: string, current: number, total: number) => void): Promise<HomeData> {
        const results: HomeData = { recommended: [], ranking: [], latest: [], recentlyAdded: [], completed: [] };

        try {
            // Pick a random page of highly rated novels to make recommendations dynamic
            const randomPage = Math.floor(Math.random() * 5) + 1;
            onProgress?.('Fetching Recommended...', 1, 5);
            const rawRecs = await this.fetchRanking('ratings', randomPage);
            results.recommended = rawRecs.sort(() => 0.5 - Math.random());

            onProgress?.('Fetching Top Ranking...', 2, 5);
            results.ranking = await this.fetchRanking(1);

            onProgress?.('Fetching Latest Updates...', 3, 5);
            results.latest = await this.fetchLatest(1);

            onProgress?.('Fetching Completed Novels...', 4, 5);
            results.completed = await this.fetchCompleted(1);

            onProgress?.('Fetching Recently Added...', 5, 5);
            results.recentlyAdded = await this.fetchRecentlyAdded(1);
        } catch (e) {
            console.error('[NovelFire] Sync failed', e);
        }

        return results;
    }

    async fetchRanking(type: string | number = 'overall', page?: number): Promise<NovelMetadata[]> {
        let pageNum = typeof type === 'number' ? type : (page || 1);
        let typeStr = typeof type === 'string' ? type : 'overall';
        
        let url = 'https://novelfire.net/ranking';
        if (typeStr === 'ratings') url += '/ratings';
        else if (typeStr === 'most-read') url += '/most-read';
        else if (typeStr === 'most-review') url += '/most-review';

        return this.fetchSection(`${url}${pageNum > 1 ? `?page=${pageNum}` : ''}`);
    }

    async fetchLatest(page: number = 1): Promise<NovelMetadata[]> {
        return this.fetchSection(`https://novelfire.net/genre-all/sort-new/status-all/all-novel${page > 1 ? `?page=${page}` : ''}`);
    }

    async fetchRecentlyAdded(page: number = 1): Promise<NovelMetadata[]> {
        return this.fetchSection(`https://novelfire.net/latest-release-novels${page > 1 ? `?page=${page}` : ''}`);
    }

    async fetchCompleted(page: number = 1): Promise<NovelMetadata[]> {
        return this.fetchSection(`https://novelfire.net/genre-all/sort-popular/status-completed/all-novel${page > 1 ? `?page=${page}` : ''}`);
    }

    private async fetchSection(url: string): Promise<NovelMetadata[]> {
        for (const proxyUrl of this.getProxies()) {
            try {
                const html = await this.fetchHtml(url, proxyUrl);
                if (!html) continue;

                const $ = cheerio.load(html);
                const novels: NovelMetadata[] = [];
                const origin = new URL(url).origin;

                $('.novel-item, .list-novel .row, .item').each((_, el) => {
                    const $el = $(el);
                    const titleEl = $el.find('.novel-title a, h3 a, a[title]').first();
                    let title = titleEl.text().trim() || titleEl.attr('title')?.trim() || '';
                    if (!title) return;

                    let novelUrl = titleEl.attr('href') || '';
                    if (novelUrl && !novelUrl.startsWith('http')) {
                        novelUrl = `${origin}${novelUrl.startsWith('/') ? '' : '/'}${novelUrl}`;
                    }

                    let imgEl = $el.find('img').first();
                    let coverUrl = imgEl.attr('data-src') || imgEl.attr('data-original') || imgEl.attr('src') || '';
                    if (coverUrl.startsWith('data:image/')) {
                        coverUrl = imgEl.attr('data-src') || imgEl.attr('data-original') || '';
                    }

                    if (coverUrl && !coverUrl.startsWith('http') && !coverUrl.startsWith('data:image/')) {
                        if (coverUrl.startsWith('//')) coverUrl = `https:${coverUrl}`;
                        else coverUrl = `${origin}${coverUrl.startsWith('/') ? '' : '/'}${coverUrl}`;
                    }

                    if (novelUrl) {
                        novels.push({
                            title,
                            author: 'Unknown',
                            coverUrl,
                            status: 'Ongoing',
                            sourceUrl: novelUrl,
                            chapters: []
                        });
                    }
                });

                if (novels.length > 0) {
                    const seen = new Set<string>();
                    return novels.filter(n => {
                        if (!n.sourceUrl) return true;
                        if (seen.has(n.sourceUrl)) return false;
                        seen.add(n.sourceUrl);
                        return true;
                    });
                }
            } catch (e) {
                console.warn(`[NovelFire] Fetch section failed`, e);
            }
        }
        return [];
    }

    private extractChaptersFromPage($: cheerio.CheerioAPI, baseUrl: string): ScrapedChapter[] {
        const chapters: ScrapedChapter[] = [];
        const seenLinks = new Set<string>();
        const origin = 'https://novelfire.net';

        const novelFireItems = $('ul.chapter-list li, .chapter-list li');
        if (novelFireItems.length > 0) {
            novelFireItems.each((_, el) => {
                const anchor = $(el).find('a').first();
                if (!anchor.length) return;

                const link = anchor.attr('href') || anchor.attr('title') || '';
                if (!link) return;

                const titleEl = anchor.find('strong.chapter-title, .chapter-title').first();
                let rawTitle = titleEl.length ? titleEl.text().trim() : '';
                if (!rawTitle) rawTitle = anchor.attr('title')?.trim() || '';
                if (!rawTitle) {
                    const clone = anchor.clone();
                    clone.find('time, .chapter-update, .chapter-no').remove();
                    rawTitle = clone.text().trim();
                }

                const dateEl = anchor.find('time.chapter-update, time, .chapter-update').first();
                const chapterDate = dateEl.length ? dateEl.text().trim() : undefined;

                const cleanTitle = this.cleanChapterTitle(rawTitle);
                const fullUrl = link.startsWith('http') ? link : `${origin}${link.startsWith('/') ? '' : '/'}${link}`;

                let finalTitle = cleanTitle;
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

        const genericSelectors = ['ul.list-chapter li', '#chapter-list li', '.chapters li', '.list-item', '.chapter-item'];
        for (const sel of genericSelectors) {
            const items = $(sel);
            if (items.length > 0) {
                items.each((_, el) => {
                    const anchor = $(el).find('a').first();
                    if (!anchor.length) return;

                    const link = anchor.attr('href');
                    if (!link) return;

                    const rawTitle = anchor.text().trim() || anchor.attr('title')?.trim() || '';
                    const cleanTitle = this.cleanChapterTitle(rawTitle);
                    const fullUrl = this.resolveUrl(baseUrl, link);

                    let finalTitle = cleanTitle;
                    if (!finalTitle || /^Chapter$/i.test(finalTitle)) {
                        const urlMatch = fullUrl.match(/chapter[_\-]?(\d+)/i);
                        if (urlMatch) finalTitle = `Chapter ${urlMatch[1]}`;
                    }

                    if (this.isValidChapterTitle(finalTitle) && !seenLinks.has(fullUrl)) {
                        chapters.push({ title: finalTitle, url: fullUrl });
                        seenLinks.add(fullUrl);
                    }
                });
                if (chapters.length > 0) break;
            }
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

    async fetchNovel(url: string, userProvidedChapters?: boolean): Promise<NovelMetadata> {
        const infoUrl = url.replace(/\/chapters\/?(\?.*)?$/, '');
        let listUrl = url;

        let title = '', author = '', coverUrl = '', summary = '', status = 'Ongoing';

        for (const proxyUrl of this.getProxies()) {
            try {
                const html = await this.fetchHtml(infoUrl, proxyUrl);
                if (!html) continue;

                const $ = cheerio.load(html);
                
                title = (
                    $('h1[itemprop="name"]').text().trim() ||
                    $('h1.novel-title').text().trim() ||
                    $('h1').first().text().trim() ||
                    $('meta[property="og:title"]').attr('content') || ''
                ).split(' Novel - Read')[0].split(' - Novel Fire')[0].trim();

                if (title) {
                    author = $('span[itemprop="author"]').first().text().trim() || $('.author a').first().text().trim() || $('.author').text().replace('Author:', '').trim() || 'Unknown';
                    
                    let extractedSummary = $('.summary .content').text().trim() || $('.summary').text().replace(/^Summary\s*/i, '').trim() || $('.description').text().trim();
                    if (!extractedSummary) {
                        const metaDesc = $('meta[name="description"]').attr('content') || '';
                        if (!metaDesc.toLowerCase().includes('novel online free')) {
                            extractedSummary = metaDesc;
                        }
                    }
                    summary = this.cleanSummary(extractedSummary);
                    
                    status = $('strong.ongoing').first().text().trim() || $('strong.status').first().text().trim() || 'Ongoing';

                    let extractedCover = $('meta[property="og:image"]').attr('content') || '';
                    if (!extractedCover || extractedCover.startsWith('data:image/')) {
                        const imgEl = $('figure.novel-cover img, .novel-cover img, .cover img').first();
                        extractedCover = imgEl.attr('data-src') || imgEl.attr('data-original') || imgEl.attr('src') || '';
                        if (extractedCover.startsWith('data:image/')) {
                            extractedCover = imgEl.attr('data-src') || imgEl.attr('data-original') || '';
                        }
                    }

                    if (extractedCover && !extractedCover.startsWith('http')) {
                        if (extractedCover.startsWith('//')) extractedCover = `https:${extractedCover}`;
                        else extractedCover = `https://novelfire.net${extractedCover.startsWith('/') ? '' : '/'}${extractedCover}`;
                    }
                    coverUrl = extractedCover;

                    if (!userProvidedChapters) {
                        const chaptersLink = $('a[href*="/chapters"]').first().attr('href');
                        if (chaptersLink) {
                            const origin = new URL(infoUrl).origin;
                            listUrl = chaptersLink.startsWith('http') ? chaptersLink : `${origin}${chaptersLink.startsWith('/') ? '' : '/'}${chaptersLink}`;
                        } else {
                            listUrl = infoUrl.replace(/\/$/, '') + '/chapters';
                        }
                    }
                    break;
                }
            } catch (e) {
                console.warn(`[NovelFire] Metadata fetch failed`, e);
            }
        }

        const allChapters: ScrapedChapter[] = [];
        const chapterUrlSet = new Set<string>();
        const visitedUrls = new Set<string>();
        let pageCount = 0;
        let currentUrl = listUrl;

        while (currentUrl && !visitedUrls.has(currentUrl) && pageCount < 50) {
            visitedUrls.add(currentUrl);
            pageCount++;
            let pageFound = false;

            for (const proxyUrl of this.getProxies()) {
                try {
                    const html = await this.fetchHtml(currentUrl, proxyUrl);
                    if (!html) continue;

                    const $ = cheerio.load(html);
                    const newChapters = this.extractChaptersFromPage($, currentUrl);

                    for (const ch of newChapters) {
                        if (!chapterUrlSet.has(ch.url)) {
                            chapterUrlSet.add(ch.url);
                            allChapters.push(ch);
                        }
                    }

                    const nextPage = this.findNextPage($, currentUrl);
                    currentUrl = nextPage && !visitedUrls.has(nextPage) ? nextPage : '';
                    pageFound = true;
                    break;
                } catch (e) {
                    console.warn(`[NovelFire] Chapter page failed`, e);
                }
            }

            if (!pageFound) break;
            if (pageCount > 0) await new Promise(resolve => setTimeout(resolve, 300));
        }

        return { title: title || 'Unknown Title', author, coverUrl, summary, status, chapters: allChapters };
    }

    async fetchNovelFast(
        url: string,
        onProgress?: (chapters: { title: string; url: string; date?: string }[], page: number, metadata?: Partial<NovelMetadata>) => void
    ): Promise<NovelMetadata> {
        const infoUrl = url.replace(/\/chapters\/?(\?.*)?$/, '');
        let listUrl = url;
        const userProvidedChapters = /\/chapters\/?(\?.*)?$/.test(url);

        let title = '', author = '', coverUrl = '', summary = '', status = 'Ongoing';
        let workingProxy: string | undefined;

        for (const proxyUrl of this.getProxies()) {
            try {
                const html = await this.fetchHtml(infoUrl, proxyUrl);
                if (!html) continue;

                const $ = cheerio.load(html);

                title = (
                    $('h1[itemprop="name"]').text().trim() ||
                    $('h1.novel-title').text().trim() ||
                    $('h1').first().text().trim() ||
                    $('meta[property="og:title"]').attr('content') || ''
                ).split(' Novel - Read')[0].split(' - Novel Fire')[0].trim();

                if (title) {
                    author = $('span[itemprop="author"]').first().text().trim() || $('.author a').first().text().trim() || 'Unknown';
                    let extractedSummary = $('.summary .content').text().trim() || $('.summary').text().replace(/^Summary\s*/i, '').trim();
                    if (!extractedSummary) {
                        const metaDesc = $('meta[name="description"]').attr('content') || '';
                        if (!metaDesc.toLowerCase().includes('novel online free')) {
                            extractedSummary = metaDesc;
                        }
                    }
                    summary = this.cleanSummary(extractedSummary);
                    status = $('strong.ongoing').first().text().trim() || $('strong.status').first().text().trim() || 'Ongoing';

                    let extractedCover = $('meta[property="og:image"]').attr('content') || '';
                    if (!extractedCover || extractedCover.startsWith('data:image/')) {
                        const imgEl = $('figure.novel-cover img, .novel-cover img, .cover img').first();
                        extractedCover = imgEl.attr('data-src') || imgEl.attr('data-original') || imgEl.attr('src') || '';
                        if (extractedCover.startsWith('data:image/')) {
                            extractedCover = imgEl.attr('data-src') || imgEl.attr('data-original') || '';
                        }
                    }

                    if (extractedCover && !extractedCover.startsWith('http')) {
                        if (extractedCover.startsWith('//')) extractedCover = `https:${extractedCover}`;
                        else {
                            if (!extractedCover.startsWith('/')) extractedCover = '/' + extractedCover;
                            extractedCover = `https://novelfire.net${extractedCover}`;
                        }
                    }
                    coverUrl = extractedCover;

                    onProgress?.([], 0, { title, author, summary, status, coverUrl });

                    if (!userProvidedChapters) {
                        const chaptersLink = $('a[href*="/chapters"]').first().attr('href');
                        if (chaptersLink) {
                            const origin = new URL(infoUrl).origin;
                            listUrl = chaptersLink.startsWith('http') ? chaptersLink : `${origin}${chaptersLink.startsWith('/') ? '' : '/'}${chaptersLink}`;
                        } else {
                            listUrl = infoUrl.replace(/\/$/, '') + '/chapters';
                        }
                    }

                    workingProxy = proxyUrl;
                    break;
                }
            } catch (e) {
                console.warn(`[NovelFire:Fast] Metadata fetch failed`, e);
            }
        }

        const allChapters: ScrapedChapter[] = [];
        const chapterUrlSet = new Set<string>();
        const visitedUrls = new Set<string>();
        let pageCount = 0;
        let currentUrl = listUrl;

        const proxyOrder = workingProxy ? [workingProxy, ...this.getProxies().filter(p => p !== workingProxy)] : this.getProxies();

        while (currentUrl && !visitedUrls.has(currentUrl) && pageCount < 50) {
            visitedUrls.add(currentUrl);
            pageCount++;
            let pageFound = false;

            for (const proxyUrl of proxyOrder) {
                try {
                    const html = await this.fetchHtml(currentUrl, proxyUrl);
                    if (!html || html.length < 500) continue;
                    
                    const $ = cheerio.load(html);
                    const newChapters = this.extractChaptersFromPage($, currentUrl);

                    for (const ch of newChapters) {
                        if (!chapterUrlSet.has(ch.url)) {
                            chapterUrlSet.add(ch.url);
                            allChapters.push(ch);
                        }
                    }

                    onProgress?.(allChapters, pageCount, { title, author, summary, status, coverUrl });

                    const nextPage = this.findNextPage($, currentUrl);
                    currentUrl = nextPage && !visitedUrls.has(nextPage) ? nextPage : '';
                    pageFound = true;
                    if (proxyUrl !== proxyOrder[0]) workingProxy = proxyUrl;
                    break;
                } catch (e) {
                    console.warn(`[NovelFire:Fast] Chapter page failed`, e);
                }
            }

            if (!pageFound) break;
            if (pageCount > 0) await new Promise(resolve => setTimeout(resolve, 300));
        }

        if (!title && allChapters.length === 0) {
            throw new Error('Failed to fetch novel metadata and chapters from NovelFire.');
        }

        return {
            title: title || 'Unknown Title',
            author, coverUrl, summary, status,
            chapters: allChapters
        };
    }

    async fetchChapterContent(url: string): Promise<string> {
        for (const proxyUrl of this.getProxies()) {
            try {
                const html = await this.fetchHtml(url, proxyUrl);
                if (!html) continue;

                const $ = cheerio.load(html);
                const contentSelectors = ['#content', '#chapter-container', '#chapter-content', '.chapter-content', '.txt'];
                let contentHtml = '';

                for (const selector of contentSelectors) {
                    const el = $(selector);
                    if (el.length > 0) {
                        el.find('.ads, .advertisement, script, style').remove();
                        contentHtml = el.html() || '';
                        break;
                    }
                }

                if (contentHtml && contentHtml.length > 100) {
                    return this.enhanceContent(contentHtml);
                }
            } catch (error) {
                console.warn(`[NovelFire] Failed to fetch chapter via proxy`, error);
            }
        }
        throw new Error('Could not fetch chapter content from NovelFire after trying all proxies.');
    }
}
