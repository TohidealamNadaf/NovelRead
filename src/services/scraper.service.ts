import { CapacitorHttp } from '@capacitor/core';
import * as cheerio from 'cheerio';

export interface NovelMetadata {
    title: string;
    author: string;
    coverUrl: string;
    chapters: { title: string; url: string }[];
}

export class ScraperService {
    async fetchNovel(url: string): Promise<NovelMetadata> {
        // 1. Determine Info URL (for Metadata) and List URL (for Chapters)
        let infoUrl = url.replace(/\/chapters\/?(\?.*)?$/, '');
        let listUrl = url;

        const userProvidedChapters = /\/chapters\/?(\?.*)?$/.test(url);

        // Helper to get proxy URL
        const getProxyUrl = (target: string) => {
            const isWeb = typeof window !== 'undefined' && window.location.protocol.startsWith('http');
            if (isWeb && !target.includes('corsproxy.io')) {
                return `https://corsproxy.io/?${encodeURIComponent(target)}`;
            }
            return target;
        };

        // 2. Fetch Metadata from Info URL
        let title = '';
        let author = '';
        let coverUrl = '';

        try {
            const response = await CapacitorHttp.get({ url: getProxyUrl(infoUrl) });
            const $ = cheerio.load(response.data);

            const getMeta = (selectors: string[]) => {
                for (const sel of selectors) {
                    const txt = $(sel).text().trim();
                    if (txt) return txt;
                }
                return '';
            };
            const getAttr = (selectors: string[], attr: string) => {
                for (const sel of selectors) {
                    const val = $(sel).attr(attr);
                    if (val) return val;
                }
                return '';
            };

            title = getMeta([
                '.novel-info .novel-title', '.title', 'h1', 'h2.title',
                '.book-name', '.truyen-title', 'meta[property="og:title"]'
            ]);
            title = title.split(' Novel - Read')[0].trim();

            author = getMeta([
                '.author', '.info-author', '.book-author',
                'span[itemprop="author"]', '.txt-author'
            ]).replace('Author:', '').trim();

            coverUrl = getAttr([
                '.novel-cover img', '.book img', '.book-cover img',
                '.img-cover', 'meta[property="og:image"]'
            ], 'src');

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

    async fetchChapterContent(url: string): Promise<string> {
        let targetUrl = url;
        const isWeb = typeof window !== 'undefined' && window.location.protocol.startsWith('http');
        if (isWeb && !targetUrl.includes('corsproxy.io')) {
            targetUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;
        }

        const response = await CapacitorHttp.get({ url: targetUrl });
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
                content = $(sel).html() || '';
                break;
            }
        }

        return content || '<p>Content not found. Please verify the source.</p>';
    }
}

export const scraperService = new ScraperService();
