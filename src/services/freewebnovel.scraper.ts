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
        const url = `https://freewebnovel.com/search`;
        console.log(`[FreeWebNovel] Searching (POST): ${url} searchkey=${query}`);
        try {
            const html = await this.fetchHtmlPost(url, { searchkey: query });
            if (!html) return [];
            const $ = cheerio.load(html);
            const novels = this.parseFreeWebNovelsList($, 'div.li');
            return novels;
        } catch (e) {
            console.error(`[FreeWebNovel] Search failed`, e);
            return [];
        }
    }

    private async fetchList(url: string) {
        for (const proxyUrl of this.getProxies(url)) {
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

        $('.m-newest2 ul li a').each((_, el: any) => {
            const link = el.attribs?.href || el.attribs?.title || '';
            if (!link) return;

            const anchor = $(el);
            const rawTitle = el.attribs?.title?.trim() || anchor.text().trim();
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
            $('ul.list-chapter li a, .chapters li a, .chapter-list li a, li a.con').each((_, el: any) => {
                const link = el.attribs?.href;
                if (!link) return;

                const anchor = $(el);
                const rawTitle = anchor.text().trim() || el.attribs?.title?.trim() || '';
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
        
        // Final fallback for AJAX fragments which might just be raw <li> tags without a <ul>
        if (chapters.length === 0) {
            $('a').each((_, el: any) => {
                const link = el.attribs?.href;
                if (!link || (!link.toLowerCase().includes('chapter') && !link.match(/\/\d+/))) return;

                const anchor = $(el);
                const rawTitle = el.attribs?.title?.trim() || anchor.text().trim() || '';
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

        for (const proxyUrl of this.getProxies(url)) {
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
        const chapterUrlSet = new Set<string>();
        const pageQueue = [url];
        const visitedUrls = new Set<string>();
        let pageCount = 0;
        let consecutiveFailures = 0;

        while (pageQueue.length > 0 && pageCount < 200) {
            const currentUrl = pageQueue.shift()!;
            if (visitedUrls.has(currentUrl)) continue;
            visitedUrls.add(currentUrl);
            pageCount++;
            let pageSuccess = false;

            for (const proxyUrl of this.getProxies(currentUrl)) {
                try {
                    const rawHtml = await this.fetchHtml(currentUrl, proxyUrl);
                    if (!rawHtml || rawHtml.length < 10) continue;
                    
                    let htmlToParse = rawHtml;
                    let knownTotalPage: number | null = null;
                    if (rawHtml.trim().startsWith('{')) {
                        try {
                            const data = JSON.parse(rawHtml);
                            if (data.html) htmlToParse = data.html;
                            if (typeof data.totalPage === 'number') knownTotalPage = data.totalPage;
                        } catch (e) {}
                    }
                    if (htmlToParse.length < 10) continue;
                    
                    const $ = cheerio.load(htmlToParse);
                    const newChapters = this.extractChapters($, currentUrl);

                    for (const ch of newChapters) {
                        if (!chapterUrlSet.has(ch.url)) {
                            chapterUrlSet.add(ch.url);
                            allChapters.push(ch);
                        }
                    }

                    const scripts = $('script').map((_, el) => $(el).html()).get().join(' ');
                    const totalPageMatch = scripts.match(/totalPage\s*:\s*(\d+)/);
                    let totalPage = 0;
                    if (totalPageMatch) {
                        totalPage = parseInt(totalPageMatch[1], 10);
                    } else if ($('#indexselect option').length > 0) {
                        totalPage = $('#indexselect option').length;
                    }
                    
                    const effectiveTotalPage = knownTotalPage || totalPage;
                    
                    if (effectiveTotalPage > 1) {
                        const cleanUrl = currentUrl.split('?')[0];
                        const nextP = currentUrl.includes('ajax=chapters') ? 2 : 2; // simplest safe default since this reverted version doesn't track a startPage offset
                        for (let p = nextP; p <= effectiveTotalPage; p++) {
                            const ajaxUrl = `${cleanUrl}?ajax=chapters&page=${p}&pageSize=40`;
                            if (!visitedUrls.has(ajaxUrl) && !pageQueue.includes(ajaxUrl)) {
                                pageQueue.push(ajaxUrl);
                            }
                        }
                    }

                    // FreeWebNovel typically uses a <select> dropdown for pagination
                    $('select option').each((_, el) => {
                        const val = $(el).attr('value');
                        if (val && val.length > 5 && !val.includes('javascript:') && !val.match(/^\d+$/)) {
                            const fullPageUrl = this.resolveUrl(currentUrl, val);
                            if (!visitedUrls.has(fullPageUrl) && !pageQueue.includes(fullPageUrl)) {
                                pageQueue.push(fullPageUrl);
                            }
                        }
                    });

                    // Also look for standard pagination if they do use it
                    const nextSelectors = ['.pagination .next a', '.pager .next a'];
                    for (const sel of nextSelectors) {
                        const el = $(sel);
                        const nextPath = el.attr('href');
                        if (nextPath) {
                            const fullNext = this.resolveUrl(currentUrl, nextPath);
                            if (!visitedUrls.has(fullNext) && !pageQueue.includes(fullNext)) {
                                pageQueue.push(fullNext);
                            }
                        }
                    }

                    pageSuccess = true;
                    break;
                } catch (e) {
                    console.warn(`[FreeWebNovel] Chapter page failed`, e);
                }
            }
            
            if (pageSuccess) {
                consecutiveFailures = 0;
            } else {
                consecutiveFailures++;
                if (consecutiveFailures >= 5) {
                    console.warn(`[FreeWebNovel] Hit 5 consecutive failures, aborting pagination.`);
                    break;
                }
            }

            if (pageQueue.length > 0 && pageCount > 0) {
                await new Promise(resolve => setTimeout(resolve, 600));
            }
        }

        return allChapters;
    }

    async fetchNovelFast(
        url: string,
        onProgress?: (chapters: { title: string; url: string; date?: string }[], page: number, metadata?: Partial<NovelMetadata>) => void
    ): Promise<NovelMetadata> {
        let title = '', author = 'Unknown', coverUrl = '', summary = '', status = 'Ongoing';
        let workingProxy: string | undefined;

        for (const proxyUrl of this.getProxies(url)) {
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
        const chapterUrlSet = new Set<string>();
        const proxyOrder = workingProxy ? [workingProxy, ...this.getProxies(url).filter(p => p !== workingProxy)] : this.getProxies(url);
        const pageQueue = [url];
        const visitedUrls = new Set<string>();
        let pageCount = 0;
        let consecutiveFailures = 0;

        while (pageQueue.length > 0 && pageCount < 200) {
            const currentUrl = pageQueue.shift()!;
            if (visitedUrls.has(currentUrl)) continue;
            visitedUrls.add(currentUrl);
            pageCount++;
            let pageSuccess = false;

            for (const proxyUrl of proxyOrder) {
                try {
                    const rawHtml = await this.fetchHtml(currentUrl, proxyUrl);
                    if (!rawHtml || rawHtml.length < 10) continue;
                    
                    let htmlToParse = rawHtml;
                    let knownTotalPage: number | null = null;
                    if (rawHtml.trim().startsWith('{')) {
                        try {
                            const data = JSON.parse(rawHtml);
                            if (data.html) htmlToParse = data.html;
                            if (typeof data.totalPage === 'number') knownTotalPage = data.totalPage;
                        } catch (e) {}
                    }
                    if (htmlToParse.length < 10) continue;
                    
                    const $ = cheerio.load(htmlToParse);
                    const newChapters = this.extractChapters($, currentUrl);

                    for (const ch of newChapters) {
                        if (!chapterUrlSet.has(ch.url)) {
                            chapterUrlSet.add(ch.url);
                            allChapters.push(ch);
                        }
                    }

                    onProgress?.(allChapters, pageCount, { title, author, summary, status, coverUrl });

                    const scripts = $('script').map((_, el) => $(el).html()).get().join(' ');
                    const totalPageMatch = scripts.match(/totalPage\s*:\s*(\d+)/);
                    let totalPage = 0;
                    if (totalPageMatch) {
                        totalPage = parseInt(totalPageMatch[1], 10);
                    } else if ($('#indexselect option').length > 0) {
                        totalPage = $('#indexselect option').length;
                    }
                    
                    const effectiveTotalPage = knownTotalPage || totalPage;
                    
                    if (effectiveTotalPage > 1) {
                        const cleanUrl = currentUrl.split('?')[0];
                        const nextP = currentUrl.includes('ajax=chapters') ? 2 : 2; // simplest safe default since this reverted version doesn't track a startPage offset
                        for (let p = nextP; p <= effectiveTotalPage; p++) {
                            const ajaxUrl = `${cleanUrl}?ajax=chapters&page=${p}&pageSize=40`;
                            if (!visitedUrls.has(ajaxUrl) && !pageQueue.includes(ajaxUrl)) {
                                pageQueue.push(ajaxUrl);
                            }
                        }
                    }

                    // FreeWebNovel typically uses a <select> dropdown for pagination
                    $('select option').each((_, el) => {
                        const val = $(el).attr('value');
                        if (val && val.length > 5 && !val.includes('javascript:') && !val.match(/^\d+$/)) {
                            const fullPageUrl = this.resolveUrl(currentUrl, val);
                            if (!visitedUrls.has(fullPageUrl) && !pageQueue.includes(fullPageUrl)) {
                                pageQueue.push(fullPageUrl);
                            }
                        }
                    });

                    const nextSelectors = ['.pagination .next a', '.pager .next a'];
                    for (const sel of nextSelectors) {
                        const el = $(sel);
                        const nextPath = el.attr('href');
                        if (nextPath) {
                            const fullNext = this.resolveUrl(currentUrl, nextPath);
                            if (!visitedUrls.has(fullNext) && !pageQueue.includes(fullNext)) {
                                pageQueue.push(fullNext);
                            }
                        }
                    }

                    if (proxyUrl !== proxyOrder[0]) {
                        workingProxy = proxyUrl;
                    }
                    
                    pageSuccess = true;
                    break;
                } catch (e) {
                    console.warn(`[FreeWebNovel:Fast] Chapter page failed`, e);
                }
            }
            
            if (pageSuccess) {
                consecutiveFailures = 0;
            } else {
                consecutiveFailures++;
                if (consecutiveFailures >= 5) {
                    console.warn(`[FreeWebNovel] Hit 5 consecutive failures, aborting pagination.`);
                    break;
                }
            }

            if (pageQueue.length > 0 && pageCount > 0) {
                await new Promise(resolve => setTimeout(resolve, 600));
            }
        }

        if (!title && allChapters.length === 0) {
            throw new Error('Failed to fetch novel metadata and chapters from FreeWebNovel.');
        }

        return {
            title: title || 'Unknown Title',
            author,
            coverUrl,
            summary,
            status,
            chapters: allChapters
        };
    }

    async fetchChapterContent(url: string): Promise<string> {
        try {
            const html = await this.fetchHtmlWithProxies(url);
            const $ = cheerio.load(html);
            const contentHtml = $('.txt').html();

            if (contentHtml && contentHtml.length > 100) {
                return this.enhanceContent(contentHtml);
            }
        } catch (error) {
            console.warn(`[FreeWebNovel] Failed to fetch chapter content`, error);
        }
        throw new Error('Could not fetch chapter content from FreeWebNovel after trying all proxies.');
    }
}
