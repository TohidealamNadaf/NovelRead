import { CapacitorHttp, Capacitor } from '@capacitor/core';
import * as cheerio from 'cheerio';

export interface NovelMetadata {
    title: string;
    author: string;
    coverUrl: string;
    summary?: string;
    status?: string;
    category?: string;
    chapters: { title: string; url: string }[];
}

export interface HomeData {
    recommended: NovelMetadata[];
    ranking: NovelMetadata[];
    latest: NovelMetadata[];
    recentlyAdded: NovelMetadata[];
    completed: NovelMetadata[];
}

export class ScraperService {
    async fetchNovel(url: string): Promise<NovelMetadata> {
        // 1. Determine Info URL (for Metadata) and List URL (for Chapters)
        let infoUrl = url.replace(/\/chapters\/?(\?.*)?$/, '');
        let listUrl = url;

        const userProvidedChapters = /\/chapters\/?(\?.*)?$/.test(url);

        // Helper to get proxy URL
        const getProxyUrl = (target: string) => {
            const isWeb = Capacitor.getPlatform() === 'web';
            if (isWeb && !target.includes('corsproxy.io')) {
                return `https://corsproxy.io/?${encodeURIComponent(target)}`;
            }
            return target;
        };

        // 2. Fetch Metadata from Info URL
        let title = '';
        let author = '';
        let coverUrl = '';

        const extractMetadata = ($: any) => {
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
            ]).replace('Author:', '').trim();

            const extractedSummary = getMeta([
                '.summary__content', '.description', '#editdescription',
                '.book-info-desc', '.content', 'meta[name="description"]'
            ]).trim();

            const extractedStatus = getMeta([
                '.status', '.info-status', '.book-status',
                '.post-content_item:contains("Status") .summary-content'
            ]).trim();

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

        try {
            // First attempt: Scrape the derived infoUrl
            // Helper for common headers
            const getHeaders = () => ({
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9'
            });

            let response = await CapacitorHttp.get({
                url: getProxyUrl(infoUrl),
                headers: getHeaders()
            });
            let $ = cheerio.load(response.data);
            let metadata = extractMetadata($);

            title = metadata.title;
            author = metadata.author;
            coverUrl = metadata.coverUrl;

            // Fallback: If cover is missing, we might be on a chapter page. Find the link to the Novel Info.
            if (!coverUrl || !title) {
                console.log("Metadata missing, attempting to find Novel Info link...");
                const novelLink = $('a[title]').filter((_, el) => {
                    const href = $(el).attr('href') || '';
                    return href.includes('/novel/') || href.includes('/book/');
                }).first().attr('href');

                if (novelLink) {
                    const origin = new URL(infoUrl).origin;
                    let nextTarget = novelLink.startsWith('http') ? novelLink : `${origin}${novelLink.startsWith('/') ? '' : '/'}${novelLink}`;

                    console.log(`Fetching fallback info URL: ${nextTarget}`);
                    response = await CapacitorHttp.get({ url: getProxyUrl(nextTarget) });
                    $ = cheerio.load(response.data);
                    metadata = extractMetadata($);

                    if (metadata.title) title = metadata.title;
                    if (metadata.author) author = metadata.author;
                    if (metadata.coverUrl) coverUrl = metadata.coverUrl;

                    // Update listUrl since we found the real root
                    if (!userProvidedChapters) listUrl = nextTarget;
                }
            }

            if (!userProvidedChapters) {
                const chaptersLink = $('a[href*="/chapters"]').first().attr('href');
                if (chaptersLink) {
                    const origin = new URL(infoUrl).origin;
                    if (chaptersLink.startsWith('/')) {
                        listUrl = origin + chaptersLink;
                    } else if (chaptersLink.startsWith('http')) {
                        listUrl = chaptersLink;
                    } else {
                        listUrl = `${origin}/${chaptersLink}`;
                    }
                }
            }
        } catch (e) {
            console.error('Failed to fetch metadata', e);
        }

        // 3. Scrape Chapters (Start Loop)
        let allChapters: { title: string; url: string }[] = [];
        const visitedUrls = new Set<string>();
        let pageCount = 0;
        const MAX_PAGES = 50;

        let currentUrl = listUrl;

        // Helper to extract chapters
        const extractChapters = ($: cheerio.CheerioAPI, baseUrl: string) => {
            const chapters: { title: string; url: string }[] = [];
            const listSelectors = [
                '.chapter-list a', 'ul.chapter-list li a', '.list-chapter li a',
                '#chapter-list a', '.chapters a', '.list-chapters a',
                '#list-chapter .row a'
            ];

            let found = false;
            for (const sel of listSelectors) {
                const els = $(sel);
                if (els.length > 0) {
                    els.each((_, el) => {
                        chapters.push({
                            title: $(el).text().trim(),
                            url: $(el).attr('href') || ''
                        });
                    });
                    found = true;
                    break;
                }
            }

            if (!found) {
                $('a').each((_, el) => {
                    const text = $(el).text().toLowerCase();
                    const href = $(el).attr('href') || '';
                    if ((text.includes('chapter') || text.includes('episode') || href.includes('chapter')) &&
                        href.length > 5 && !href.startsWith('javascript') && !href.startsWith('#')) {
                        chapters.push({
                            title: $(el).text().trim(),
                            url: href
                        });
                    }
                });
            }

            const origin = new URL(baseUrl).origin;
            return chapters.map(ch => {
                let chUrl = ch.url;
                if (chUrl && !chUrl.startsWith('http')) {
                    if (chUrl.startsWith('/')) {
                        chUrl = `${origin}${chUrl}`;
                    } else {
                        chUrl = `${origin}/${chUrl}`;
                    }
                }
                return { ...ch, url: chUrl };
            }).filter(ch => ch.url);
        };

        // Helper to find next page
        const findNextPage = ($: cheerio.CheerioAPI, baseUrl: string): string | null => {
            let nextUrl = '';
            const nextSelectors = [
                'a[rel="next"]', '.pagination .next a', '.pager .next a',
                '.pagination a:contains("Next")', '.pagination a:contains("»")',
                '.pager a:contains("Next")', 'li.next a', '.nav-next a'
            ];

            for (const sel of nextSelectors) {
                const el = $(sel);
                if (el.length > 0) {
                    nextUrl = el.attr('href') || '';
                    if (nextUrl) break;
                }
            }

            if (!nextUrl) return null;

            if (nextUrl && !nextUrl.startsWith('http')) {
                const origin = new URL(baseUrl).origin;
                if (nextUrl.startsWith('/')) {
                    nextUrl = `${origin}${nextUrl}`;
                } else {
                    nextUrl = `${origin}/${nextUrl}`;
                }
            }
            return nextUrl;
        };

        // --- Main Loop ---
        while (currentUrl && !visitedUrls.has(currentUrl) && pageCount < MAX_PAGES) {
            visitedUrls.add(currentUrl);
            pageCount++;
            console.log(`Scraping page ${pageCount}: ${currentUrl}`);

            try {
                const response = await CapacitorHttp.get({ url: getProxyUrl(currentUrl) });
                const $ = cheerio.load(response.data);

                const newChapters = extractChapters($, currentUrl);

                for (const ch of newChapters) {
                    if (!allChapters.some(c => c.url === ch.url)) {
                        allChapters.push(ch);
                    }
                }

                if (newChapters.length === 0) break;

                const nextPage = findNextPage($, currentUrl);
                if (nextPage && !visitedUrls.has(nextPage)) {
                    currentUrl = nextPage;
                    await new Promise(r => setTimeout(r, 500));
                } else {
                    currentUrl = '';
                }

            } catch (error) {
                console.error(`Failed to scrape page ${currentUrl}`, error);
                break;
            }
        }

        return {
            title: title || 'Unknown Title',
            author: author || 'Unknown Author',
            coverUrl,
            chapters: allChapters
        };
    }

    private enhanceContent(html: string): string {
        const $ = cheerio.load(html, { xmlMode: false }); // Use HTML mode

        // Iterate over all text nodes to safely replace content without breaking HTML tags
        $('*').contents().each((_, elem) => {
            if (elem.type === 'text') {
                let text = $(elem).text();

                // 1. Format System Messages: [ System Notification ]
                // Matches content inside square brackets
                text = text.replace(/(\[[^\]]+\])/g, '<span class="smart-system">$1</span>');

                // 2. Format Parenthetical Asides: ( Note )
                // Matches content inside parentheses, but avoid likely math/code usage if possible
                text = text.replace(/(\([^\)]+\))/g, '<span class="smart-note">$1</span>');

                // 3. Format Thoughts: ' I should go ' 
                // Heuristic: Single quotes surrounded by spaces or punctuation, avoiding contractions like "don't"
                // This is tricky. We look for ' followed by text followed by '
                // We use a negative lookbehind for alphanumeric to avoid "don't" (n't) matches at the start
                // and negative lookahead to avoid contractions.
                // Simplified: Space/Start + ' + text + ' + Space/End/Punctuation
                text = text.replace(/(^|\s|>)(')([^']{2,}?)(')(?=$|\s|<|[.,;:?!])/g, '$1<span class="smart-thought">$2$3$4</span>');

                // 4. Format Sound Effects: *Boom*
                text = text.replace(/(^|\s|>)(\*)([^*]+)(\*)(?=$|\s|<|[.,;:?!])/g, '$1<span class="smart-sfx">$2$3$4</span>');

                $(elem).replaceWith(text);
            }
        });

        return $('body').html() || html;
    }

    async fetchChapterContent(url: string): Promise<string> {
        let targetUrl = url;
        const isWeb = Capacitor.getPlatform() === 'web';
        if (isWeb && !targetUrl.includes('corsproxy.io')) {
            targetUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;
        }

        console.log(`Fetching chapter content from: ${targetUrl}`);
        const response = await CapacitorHttp.get({
            url: targetUrl,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8'
            }
        });
        const $ = cheerio.load(response.data);

        // Remove known junk
        $('script, style, .ads, .ad-container, iframe, .hidden, .announcement').remove();

        // Try generic content selectors in order of likelihood
        const contentSelectors = [
            '#chapter-content', '.chapter-content', '#chr-content',
            '.read-content', '.reading-content', '.text-left',
            '#content', '.entry-content'
        ];

        let content = '';
        for (const sel of contentSelectors) {
            if ($(sel).length > 0) {
                // Get inner HTML
                content = $(sel).html() || '';
                break;
            }
        }

        if (!content) {
            return '<p>Content not found. Please verify the source.</p>';
        }

        return this.enhanceContent(content);
    }

    async fetchHomeData(): Promise<HomeData> {
        const urls = ['https://novelfire.net/home', 'https://novelfire.net/'];
        const proxies = [
            (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
            (url: string) => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`
        ];

        const isWeb = Capacitor.getPlatform() === 'web';
        const origin = 'https://novelfire.net';

        const parseNovels = ($: any, selector: string) => {
            const novels: (NovelMetadata & { sourceUrl: string })[] = [];
            $(selector).each((_: number, el: any) => {
                const $el = $(el);
                let title = $el.find('h3, h4, h5, .title, .book-name, .novel-title').first().text().trim();
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

                // Handle relative image paths
                if (coverUrl && !coverUrl.startsWith('http')) {
                    if (coverUrl.startsWith('//')) {
                        coverUrl = `https:${coverUrl}`;
                    } else {
                        if (!coverUrl.startsWith('/')) coverUrl = '/' + coverUrl;
                        coverUrl = `${origin}${coverUrl}`;
                    }
                }

                const author = $el.find('.author, .book-author').first().text().trim() || 'Unknown';

                if (title && url && (url.includes('/book/') || url.includes('/novel/'))) {
                    novels.push({
                        title,
                        author,
                        coverUrl,
                        summary: $el.find('.description, .excerpt').first().text().trim() || '',
                        status: 'Ongoing',
                        sourceUrl: url,
                        chapters: []
                    });
                }
            });
            return novels;
        };

        const results: HomeData = { recommended: [], ranking: [], latest: [], recentlyAdded: [], completed: [] };

        for (const url of urls) {
            for (const getProxyUrl of proxies) {
                try {
                    const targetUrl = isWeb ? getProxyUrl(url) : url;
                    console.log(`[Scraper] Fetching: ${targetUrl}`);

                    const response = await CapacitorHttp.get({
                        url: targetUrl,
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8'
                        }
                    });

                    console.log(`[Scraper] Status: ${response.status} for ${url}`);

                    let html = '';
                    if (typeof response.data === 'string') {
                        html = response.data;
                    } else if (response.data && typeof response.data === 'object') {
                        // Some proxies like allorigins return { contents: "..." }
                        html = response.data.contents || JSON.stringify(response.data);
                    }

                    if (!html || html.length < 500) {
                        console.warn(`[Scraper] Suspiciously short response (${html?.length || 0} bytes)`);
                        continue;
                    }

                    const $ = cheerio.load(html);

                    const recommended = parseNovels($, '.recommended-novels .item, .featured .item, .hot-novels .item, .carousel-item, .trending-item, .item-recommended, .section-recommended .item, .home-recommended .item, .recommended .item, [class*="recommended"] .item');
                    const ranking = parseNovels($, '.ranking-list .item, .top-rated .item, .ranking .item, .list-ranking .item, .item-ranking, .section-ranking .item, .home-ranking .item, .ranking .list-row, [class*="ranking"] .item, [class*="top-rated"] .item');
                    const latest = parseNovels($, '.latest-updates .item, .new-novels .item, .list-novel .item, .update-item, .latest-releases .item, .section-latest .item, .home-latest .item, .latest-releases .item, [class*="latest"] .item, [class*="new-novels"] .item');
                    const recentlyAdded = parseNovels($, '.recent-chapters .item, .recent-updates .item, .newest-item, .item-recent, .section-recent .item, .home-recent .item, [class*="recent"] .item');
                    const completed = parseNovels($, '.completed-stories .item, .completed .item, .item-completed, .section-completed .item, .home-completed .item, .completed-source .item, [class*="completed"] .item');

                    // Aggregate
                    if (recommended.length > 0) results.recommended = [...results.recommended, ...recommended.slice(0, 5)];
                    if (ranking.length > 0) results.ranking = [...results.ranking, ...ranking.slice(0, 10)];
                    if (latest.length > 0) results.latest = [...results.latest, ...latest.slice(0, 10)];
                    if (recentlyAdded.length > 0) results.recentlyAdded = [...results.recentlyAdded, ...recentlyAdded.slice(0, 10)];
                    if (completed.length > 0) results.completed = [...results.completed, ...completed.slice(0, 10)];

                    // Global Fallback if NO specific sections found but we have content
                    if (results.recommended.length === 0 && results.latest.length === 0) {
                        console.log("[Scraper] No specific sections found, trying global fallback for any novel links...");

                        // Very broad fallback for ANY item-like structure
                        const broadNovels = parseNovels($, '.item, .col-6, .box, .list-row, .novel-item, .book-item, [class*="novel"], [class*="book"]');

                        if (broadNovels.length > 0) {
                            console.log(`[Scraper] Global fallback found ${broadNovels.length} novels, distributing...`);
                            // Distribute into sections for better UI
                            if (results.recommended.length === 0) results.recommended = broadNovels.slice(0, 5);
                            if (results.ranking.length === 0) results.ranking = broadNovels.slice(5, 15);
                            if (results.latest.length === 0) results.latest = broadNovels.slice(15, 25);
                            if (results.completed.length === 0) results.completed = broadNovels.slice(25, 35);
                        } else {
                            const allLinks = parseNovels($, 'a[href*="/book/"], a[href*="/novel/"]').slice(0, 20);
                            if (allLinks.length > 0) {
                                results.latest = allLinks;
                                console.log(`[Scraper] Global fallback (links only) found ${allLinks.length} novels`);
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
            if (results.recommended.length > 2 || results.latest.length > 2) break;
        }

        const dedupe = (arr: any[]) => {
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
