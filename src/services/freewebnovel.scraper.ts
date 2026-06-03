import type { INovelScraper } from './scraper.interface';
import { BaseScraper } from './base.scraper';
import type { HomeData, NovelMetadata, ScrapedChapter } from './scraper.service';
import * as cheerio from 'cheerio';

export class FreeWebNovelScraper extends BaseScraper implements INovelScraper {
    private parseFreeWebNovelsList($: cheerio.CheerioAPI, selector: string): (NovelMetadata & { sourceUrl: string })[] {
        const novels: (NovelMetadata & { sourceUrl: string })[] = [];
        const origin = 'https://freewebnovel.com';

        $(selector).each((_, el) => {
            const $el = $(el);
            const titleEl = $el.find('.tit a').first();
            let title = titleEl.attr('title') || titleEl.text().trim();
            if (!title) return;

            let url = titleEl.attr('href') || '';
            if (url && !url.startsWith('http')) {
                if (!url.startsWith('/')) url = '/' + url;
                url = `${origin}${url}`;
            }

            let coverUrl = $el.find('.pic img').first().attr('src') || '';
            if (coverUrl && !coverUrl.startsWith('http')) {
                if (!coverUrl.startsWith('/')) coverUrl = '/' + coverUrl;
                coverUrl = `${origin}${coverUrl}`;
            }

            if (url) {
                novels.push({
                    title,
                    author: 'Unknown',
                    coverUrl,
                    summary: '',
                    status: 'Ongoing',
                    sourceUrl: url,
                    chapters: []
                });
            }
        });

        const seen = new Set<string>();
        return novels.filter(n => {
            if (seen.has(n.sourceUrl)) return false;
            seen.add(n.sourceUrl);
            return true;
        });
    }

    async searchNovels(query: string): Promise<NovelMetadata[]> {
        const url = `https://freewebnovel.com/search?searchkey=${encodeURIComponent(query)}`;
        console.log(`[FreeWebNovel] Searching: ${url}`);
        for (const proxyUrl of this.getProxies()) {
            try {
                const html = await this.fetchHtml(url, proxyUrl);
                if (!html) continue;
                const $ = cheerio.load(html);
                const novels = this.parseFreeWebNovelsList($, 'div.li');
                if (novels.length > 0) return novels;
            } catch (e) {
                console.error(`[FreeWebNovel] Search failed`, e);
            }
        }
        return [];
    }

    private async fetchList(url: string) {
        for (const proxyUrl of this.getProxies()) {
            const html = await this.fetchHtml(url, proxyUrl);
            if (html) {
                const $ = cheerio.load(html);
                return this.parseFreeWebNovelsList($, 'div.li');
            }
        }
        return [];
    }

    async syncDiscoverData(onProgress?: (task: string, current: number, total: number) => void): Promise<HomeData> {
        const results: HomeData = { recommended: [], ranking: [], latest: [], recentlyAdded: [], completed: [] };

        try {
            onProgress?.('Syncing Top Rankings...', 1, 4);
            results.ranking = await this.fetchList('https://freewebnovel.com/sort/most-popular');

            onProgress?.('Syncing Latest Updates...', 2, 4);
            results.latest = await this.fetchList('https://freewebnovel.com/sort/latest-release');

            onProgress?.('Syncing Completed Stories...', 3, 4);
            results.completed = await this.fetchList('https://freewebnovel.com/sort/completed-novel');

            onProgress?.('Syncing Recently Added...', 4, 4);
            results.recentlyAdded = await this.fetchList('https://freewebnovel.com/sort/latest-novel');

            onProgress?.('Generating Recommendations...', 5, 5);
            results.recommended = [...results.ranking].sort(() => 0.5 - Math.random()).slice(0, 10);
            
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
            results.ranking = dedupe(results.ranking);
            results.latest = dedupe(results.latest);
            results.completed = dedupe(results.completed);
            results.recentlyAdded = dedupe(results.recentlyAdded);
        } catch (e) {
            console.error('[FreeWebNovel] Sync failed', e);
        }
        return results;
    }

    async fetchRanking(page: number = 1): Promise<NovelMetadata[]> {
        return this.fetchList(`https://freewebnovel.com/sort/most-popular${page > 1 ? `/${page}` : ''}`);
    }

    async fetchLatest(page: number = 1): Promise<NovelMetadata[]> {
        return this.fetchList(`https://freewebnovel.com/sort/latest-release${page > 1 ? `/${page}` : ''}`);
    }

    async fetchCompleted(page: number = 1): Promise<NovelMetadata[]> {
        return this.fetchList(`https://freewebnovel.com/sort/completed-novel${page > 1 ? `/${page}` : ''}`);
    }

    async fetchRecentlyAdded(page: number = 1): Promise<NovelMetadata[]> {
        return this.fetchList(`https://freewebnovel.com/sort/latest-novel${page > 1 ? `/${page}` : ''}`);
    }

    private extractChapters($: cheerio.CheerioAPI, baseUrl: string): ScrapedChapter[] {
        const chapters: ScrapedChapter[] = [];
        const seenLinks = new Set<string>();

        $('.m-newest2 ul li').each((_, el) => {
            const anchor = $(el).find('a').first();
            if (!anchor.length) return;

            const link = anchor.attr('href') || anchor.attr('title') && '';
            if (!link) return;

            const rawTitle = anchor.attr('title')?.trim() || anchor.text().trim();
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

        // Some pages might use `.m-newest1 ul li` or similar
        if (chapters.length === 0) {
            $('ul.list-chapter li, .chapters li, .chapter-list li').each((_, el) => {
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
        }
        return chapters;
    }

    async fetchNovel(url: string, _userProvidedChapters?: boolean): Promise<NovelMetadata> {
        let title = '', author = 'Unknown', coverUrl = '', summary = '', status = 'Ongoing';
        let listUrl = url;

        for (const proxyUrl of this.getProxies()) {
            try {
                const html = await this.fetchHtml(url, proxyUrl);
                if (!html) continue;

                const $ = cheerio.load(html);
                title = $('h1.tit').text().trim() || $('meta[property="og:title"]').attr('content')?.trim() || '';
                
                if (title) {
                    let extractedCover = $('.m-book1 .pic img').first().attr('src') || $('meta[property="og:image"]').attr('content') || $('.pic img').first().attr('src') || '';
                    if (extractedCover && !extractedCover.startsWith('http')) {
                        extractedCover = `https://freewebnovel.com${extractedCover.startsWith('/') ? '' : '/'}${extractedCover}`;
                    }
                    coverUrl = extractedCover;
                    summary = this.cleanSummary($('.inner').text().trim());

                    const extractedAuthor = $('span[title="Author"]').next('.right').text().trim() || $('meta[property="og:novel:author"]').attr('content')?.trim();
                    if (extractedAuthor) author = extractedAuthor;

                    const extractedStatus = $('span[title="Status"]').next('.right').text().trim() || $('meta[property="og:novel:status"]').attr('content')?.trim();
                    if (extractedStatus) status = extractedStatus;

                    break;
                }
            } catch (e) {
                console.warn(`[FreeWebNovel] Metadata fetch failed`, e);
            }
        }

        const chapters = await this.scrapeChapterList(listUrl);
        return {
            title: title || 'Unknown Title',
            author,
            coverUrl,
            summary,
            status,
            chapters
        };
    }

    private async scrapeChapterList(url: string): Promise<ScrapedChapter[]> {
        const allChapters: ScrapedChapter[] = [];
        let currentUrl = url;
        const visitedUrls = new Set<string>();
        let pageCount = 0;

        while (currentUrl && !visitedUrls.has(currentUrl) && pageCount < 50) {
            visitedUrls.add(currentUrl);
            pageCount++;
            let pageFound = false;

            for (const proxyUrl of this.getProxies()) {
                try {
                    const html = await this.fetchHtml(currentUrl, proxyUrl);
                    if (!html || html.length < 500) continue;
                    
                    const $ = cheerio.load(html);
                    const newChapters = this.extractChapters($, currentUrl);

                    for (const ch of newChapters) {
                        if (!allChapters.some(c => c.url === ch.url)) {
                            allChapters.push(ch);
                        }
                    }

                    // FreeWebNovel chapter list usually doesn't paginate chapters on detail page,
                    // but we look for standard pagination if they do
                    const nextSelectors = ['.pagination .next a', '.pager .next a'];
                    const origin = new URL(currentUrl).origin;
                    let nextPage = null;
                    for (const sel of nextSelectors) {
                        const el = $(sel);
                        const nextPath = el.attr('href');
                        if (nextPath) {
                            nextPage = nextPath.startsWith('http') ? nextPath : `${origin}${nextPath.startsWith('/') ? '' : '/'}${nextPath}`;
                            break;
                        }
                    }

                    currentUrl = nextPage && !visitedUrls.has(nextPage) ? nextPage : '';
                    pageFound = true;
                    break;
                } catch (e) {
                    console.warn(`[FreeWebNovel] Chapter page failed`, e);
                }
            }
            if (!pageFound) break;
            if (pageCount > 0) await new Promise(resolve => setTimeout(resolve, 300));
        }

        return allChapters;
    }

    async fetchNovelFast(
        url: string,
        onProgress?: (chapters: { title: string; url: string; date?: string }[], page: number, metadata?: Partial<NovelMetadata>) => void
    ): Promise<NovelMetadata> {
        let title = '', author = 'Unknown', coverUrl = '', summary = '', status = 'Ongoing';
        let workingProxy: string | undefined;

        for (const proxyUrl of this.getProxies()) {
            try {
                const html = await this.fetchHtml(url, proxyUrl);
                if (!html) continue;

                const $ = cheerio.load(html);
                title = $('h1.tit').text().trim() || $('meta[property="og:title"]').attr('content')?.trim() || '';
                
                if (title) {
                    let extractedCover = $('.m-book1 .pic img').first().attr('src') || $('meta[property="og:image"]').attr('content') || $('.pic img').first().attr('src') || '';
                    if (extractedCover && !extractedCover.startsWith('http')) {
                        extractedCover = `https://freewebnovel.com${extractedCover.startsWith('/') ? '' : '/'}${extractedCover}`;
                    }
                    coverUrl = extractedCover;
                    summary = this.cleanSummary($('.inner').text().trim());

                    const extractedAuthor = $('span[title="Author"]').next('.right').text().trim() || $('meta[property="og:novel:author"]').attr('content')?.trim();
                    if (extractedAuthor) author = extractedAuthor;

                    const extractedStatus = $('span[title="Status"]').next('.right').text().trim() || $('meta[property="og:novel:status"]').attr('content')?.trim();
                    if (extractedStatus) status = extractedStatus;
                    
                    onProgress?.([], 0, { title, author, summary, status, coverUrl });
                    workingProxy = proxyUrl;
                    break;
                }
            } catch (e) {
                console.warn(`[FreeWebNovel:Fast] Metadata fetch failed`, e);
            }
        }

        const allChapters: ScrapedChapter[] = [];
        const proxyOrder = workingProxy ? [workingProxy, ...this.getProxies().filter(p => p !== workingProxy)] : this.getProxies();
        let currentUrl = url;
        const visitedUrls = new Set<string>();
        let pageCount = 0;

        while (currentUrl && !visitedUrls.has(currentUrl) && pageCount < 50) {
            visitedUrls.add(currentUrl);
            pageCount++;
            let pageFound = false;

            for (const proxyUrl of proxyOrder) {
                try {
                    const html = await this.fetchHtml(currentUrl, proxyUrl);
                    if (!html || html.length < 500) continue;
                    
                    const $ = cheerio.load(html);
                    const newChapters = this.extractChapters($, currentUrl);

                    for (const ch of newChapters) {
                        if (!allChapters.some(c => c.url === ch.url)) {
                            allChapters.push(ch);
                        }
                    }

                    onProgress?.(allChapters, pageCount, { title, author, summary, status, coverUrl });

                    let nextPage = null;
                    const nextSelectors = ['.pagination .next a', '.pager .next a'];
                    const origin = new URL(currentUrl).origin;
                    for (const sel of nextSelectors) {
                        const el = $(sel);
                        const nextPath = el.attr('href');
                        if (nextPath) {
                            nextPage = nextPath.startsWith('http') ? nextPath : `${origin}${nextPath.startsWith('/') ? '' : '/'}${nextPath}`;
                            break;
                        }
                    }

                    currentUrl = nextPage && !visitedUrls.has(nextPage) ? nextPage : '';
                    pageFound = true;
                    if (proxyUrl !== proxyOrder[0]) workingProxy = proxyUrl;
                    break;
                } catch (e) {
                    console.warn(`[FreeWebNovel:Fast] Chapter page failed`, e);
                }
            }
            if (!pageFound) break;
            if (pageCount > 0) await new Promise(resolve => setTimeout(resolve, 300));
        }

        if (!title && allChapters.length === 0) {
            throw new Error('Failed to fetch novel metadata and chapters from FreeWebNovel.');
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
                const contentHtml = $('.txt').html();

                if (contentHtml && contentHtml.length > 100) {
                    return this.enhanceContent(contentHtml);
                }
            } catch (error) {
                console.warn(`[FreeWebNovel] Failed to fetch chapter via proxy`, error);
            }
        }
        throw new Error('Could not fetch chapter content from FreeWebNovel after trying all proxies.');
    }
}
