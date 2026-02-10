import { CapacitorHttp } from '@capacitor/core';
import { Capacitor } from '@capacitor/core';
import * as cheerio from 'cheerio';
import type { NovelMetadata } from '../scraper.service';

const BASE_URL = 'https://asuracomic.net';

export class AsuraScraperService {
    async searchManga(query: string): Promise<NovelMetadata[]> {
        const url = `${BASE_URL}/series?page=1&name=${encodeURIComponent(query)}`;
        const html = await this.fetchHtml(url);
        if (!html) return [];

        const $ = cheerio.load(html);
        const results: NovelMetadata[] = [];
        const seenUrls = new Set<string>();

        // Find all links containing series/ (results are typically in a grid)
        // We avoid strict parent selectors like 'div.grid' which may change on mobile
        $('a[href*="series/"]').each((_, el) => {
            const a = $(el);
            const href = a.attr('href');
            if (!href) return;

            // Ensure absolute URL and deduplicate
            const sourceUrl = href.startsWith('http') ? href : `${BASE_URL}${href.startsWith('/') ? '' : '/'}${href}`;
            if (seenUrls.has(sourceUrl)) return;
            seenUrls.add(sourceUrl);

            // Title detection: 
            // 1. Specific spans used in grid (font-bold or text-white for mobile)
            // 2. Headings (h3)
            // 3. Fallback to any element with font-bold class or text-white
            let title = a.find('span.font-bold').text().trim() ||
                a.find('span.text-white').text().trim() ||
                a.find('h3').text().trim() ||
                a.find('.font-bold').first().text().trim() ||
                a.find('.text-white').first().text().trim();

            if (!title) {
                // Remove common UI elements and get pure text
                const tempA = a.clone();
                tempA.find('span.status, .status, .type, .px-1, .absolute, .hidden').remove();
                title = tempA.text().trim();
                if (title.includes('\n')) title = title.split('\n')[0].trim();
            }

            // Final fallback to anchor text if still empty
            if (!title) title = a.text().trim();

            // Cleanup title (remove extra spaces/newlines)
            title = title.replace(/\s+/g, ' ').replace('Chapter', '').trim();

            // Image detection: check multiple sources for lazy loading
            const img = a.find('img');
            const coverUrl = img.attr('src') ||
                img.attr('data-src') ||
                img.attr('data-lazy-src') ||
                img.attr('srcset')?.split(' ')[0] ||
                img.attr('data-srcset')?.split(' ')[0] || '';

            const status = a.find('span.status, .status').text().trim() || 'Ongoing';

            // Filter out obvious navigation/header links
            if (title && title.length > 2 &&
                !title.toLowerCase().includes('home') &&
                !title.toLowerCase().includes('series') &&
                !title.toLowerCase().includes('bookmark')) {
                results.push({
                    title,
                    author: 'Asura Scans',
                    coverUrl: coverUrl,
                    chapters: [],
                    sourceUrl: sourceUrl,
                    sourceId: sourceUrl,
                    status: status
                });
            }
        });

        return results;
    }

    async getDiscoverManga(): Promise<{ trending: NovelMetadata[], popular: NovelMetadata[], latest: NovelMetadata[] }> {
        const url = BASE_URL;
        const html = await this.fetchHtml(url);
        if (!html) return { trending: [], popular: [], latest: [] };

        const $ = cheerio.load(html);
        const trending: NovelMetadata[] = [];
        const popular: NovelMetadata[] = [];
        const latest: NovelMetadata[] = [];

        // 1. Trending (Carousel slides)
        // From home analysis: slides have class 'slide'
        $('li.slide').each((_, el) => {
            const slide = $(el);
            const a = slide.find('a[href*="series/"]').first();
            const href = a.attr('href');
            if (!href) return;

            const title = slide.find('.ellipsis a').text().trim() || a.find('span.font-bold').text().trim();
            const coverUrl = slide.find('img[alt="poster"]').attr('src') || '';
            const status = slide.find('span.status, .status').text().trim() || 'Ongoing';

            if (title) {
                trending.push({
                    title,
                    author: slide.find('.info-left .release-year').text().trim() || 'Asura Scans',
                    coverUrl,
                    chapters: [],
                    sourceUrl: href.startsWith('http') ? href : `${BASE_URL}${href.startsWith('/') ? '' : '/'}${href}`,
                    status,
                    category: 'Manhwa'
                });
            }
        });

        const seenUrls = new Set<string>();

        // 2. Popular Today & Latest Updates
        // These sections use different classes but both are text-white containers
        $('div.text-white').each((_, section) => {
            const header = $(section).find('h3').text().trim();
            const isPopular = header.includes('Popular Today');
            const isLatest = header.includes('Latest Update');

            if (isPopular || isLatest) {
                // Find all items within this section
                $(section).find('a[href*="series/"]').each((_, el) => {
                    const a = $(el);
                    let href = a.attr('href') || '';
                    if (!href) return;

                    let sourceUrl = href.startsWith('http') ? href : `${BASE_URL}${href.startsWith('/') ? '' : '/'}${href}`;

                    // Skip genres or other non-series links
                    if (sourceUrl.includes('?genre=')) return;

                    // We allow some duplicates if the second link provides a better title/cover
                    const titleRaw = a.find('span.font-bold').text().trim() || a.find('h3').text().trim() || a.text().trim();
                    const title = titleRaw.replace(/\s+/g, ' ').replace('MANHWA', '').trim();
                    const coverUrl = a.find('img').attr('src') || a.find('img').attr('data-src') || '';

                    if (title || coverUrl) {
                        // If we already have this URL but found a better title or cover, merge it
                        const targetList = isPopular ? popular : latest;
                        const existing = targetList.find(item => item.sourceUrl === sourceUrl);

                        if (existing) {
                            // Only update if current one is better
                            if (title && (existing.title === 'Loading...' || !existing.title)) {
                                existing.title = title;
                            }
                            if (coverUrl && !existing.coverUrl) {
                                existing.coverUrl = coverUrl;
                            }
                        } else {
                            const item = {
                                title: title || 'Loading...',
                                author: 'Asura Scans',
                                coverUrl,
                                chapters: [],
                                sourceUrl,
                                status: 'Ongoing',
                                category: 'Manhwa'
                            };
                            targetList.push(item);
                            seenUrls.add(sourceUrl);
                        }
                    }
                });
            }
        });

        // Deduplicate and limit
        const limitToUnique = (arr: NovelMetadata[]) => {
            const seen = new Set<string>();
            return arr.filter(item => {
                if (seen.has(item.title)) return false;
                seen.add(item.title);
                return true;
            }).slice(0, 15);
        };

        return {
            trending: limitToUnique(trending),
            popular: limitToUnique(popular),
            latest: limitToUnique(latest)
        };
    }

    async fetchSeriesList(page: number): Promise<NovelMetadata[]> {
        const url = `${BASE_URL}/series?page=${page}`;
        const html = await this.fetchHtml(url);
        if (!html) return [];

        const $ = cheerio.load(html);
        const results: NovelMetadata[] = [];
        const seenUrls = new Set<string>();

        // Find all items in the series list grid
        $('a[href*="series/"]').each((_, el) => {
            const a = $(el);
            const href = a.attr('href');
            if (!href) return;

            // Ensure absolute URL and deduplicate
            const sourceUrl = href.startsWith('http') ? href : `${BASE_URL}${href.startsWith('/') ? '' : '/'}${href}`;
            if (seenUrls.has(sourceUrl)) return;
            seenUrls.add(sourceUrl);

            // Structure detection based on asura_series_raw.html analysis
            const titleRaw = a.find('span.font-bold').first().text().trim() ||
                a.find('h3').first().text().trim() ||
                a.text().trim();

            const title = titleRaw.replace(/\s+/g, ' ').replace('MANHWA', '').trim();

            const coverUrl = a.find('img').attr('src') ||
                a.find('img').attr('data-src') || '';

            const status = a.find('span.status, .status').text().trim() || 'Ongoing';

            if (title && !title.toLowerCase().includes('chapter') && !title.toLowerCase().includes('previous') && !title.toLowerCase().includes('next')) {
                results.push({
                    title: title.replace(/\s+/g, ' ').trim(),
                    author: 'Asura Scans',
                    coverUrl,
                    chapters: [],
                    sourceUrl: sourceUrl,
                    sourceId: sourceUrl,
                    status: status,
                    category: 'Manhwa'
                });
            }
        });

        return results;
    }

    async fetchMangaDetails(url: string): Promise<NovelMetadata | null> {
        const html = await this.fetchHtml(url);
        if (!html) return null;

        const $ = cheerio.load(html);

        const title = $('span.text-xl.font-bold').first().text().trim();
        const coverUrl = $('img[alt="poster"]').attr('src') || '';

        let author = 'Unknown';
        let status = 'Unknown';

        // Loop through the grid-cols-2 items for Status and Type, or other metadata
        // Status is explicitly labeled
        $('div.bg-\\[\\#343434\\]').each((_, el) => {
            const label = $(el).find('h3').first().text().trim();
            const value = $(el).find('h3').last().text().trim();
            if (label.includes('Status')) status = value;
        });

        // Author is in the grid below synopsis
        // Structure: div > h3 (Author) + h3 (Value)
        $('.grid div').each((_, el) => {
            const label = $(el).find('h3').first().text().trim();
            const value = $(el).find('h3').last().text().trim();
            if (label.includes('Author')) author = value;
        });

        const summary = $('span.font-medium.text-sm p').text().trim();

        const chapters: { title: string; url: string }[] = [];

        // Chapter list container
        // Selector: div.overflow-y-auto a
        $('div.overflow-y-auto a').each((_, el) => {
            const link = $(el).attr('href');
            let chapTitle = $(el).find('h3.text-sm').text().trim();
            // Clean up title (remove excess whitespace, "MANHWA" labels if any)
            chapTitle = chapTitle.replace(/\s+/g, ' ').replace('MANHWA', '').trim();
            const date = $(el).find('h3.text-xs').text().trim();

            if (link) {
                // The href is like "solo-leveling-a4b483cd/chapter/200".
                // We need to construct the full URL. 
                // Since 'url' passed to this function is "https://asuracomic.net/series/solo-leveling-a4b483cd"
                // And the link seems to be relative to "/series/" parent? 
                // Let's assume absolute path construction for safety.
                // If link doesn't start with http, append it to BASE_URL + /series/ + ...?
                // Actually, if we look at the href "solo-leveling-a4b483cd/chapter/200", it includes the slug.
                // So BASE_URL + /series/ + link seems correct.

                const chapterUrl = link.startsWith('http') ? link : `${BASE_URL}/series/${link}`;

                // Clean up title
                chapTitle = chapTitle.replace(/\s+/g, ' ').trim();

                chapters.push({
                    title: chapTitle + (date ? ` (${date})` : ''),
                    url: chapterUrl
                });
            }
        });

        return {
            title,
            author,
            coverUrl,
            status,
            summary,
            category: 'Manhwa',
            chapters: chapters.reverse(), // Reversing to ensure oldest chapters (Chapter 1) are at index 0
            sourceUrl: url,
            sourceId: url
        };
    }

    async fetchChapterImages(url: string): Promise<string[]> {
        const html = await this.fetchHtml(url);
        if (!html) return [];

        // Images are not in the DOM but in Next.js hydration scripts.
        // We'll extract them using Regex on the raw HTML.
        const urlRegex = /https?:\/\/[^"'\s\\]+\.(?:jpg|jpeg|png|webp|avif)/gi;
        const matches = html.match(urlRegex) || [];

        // Filter and deduplicate
        const uniqueImages = new Set<string>();

        matches.forEach(imageUrl => {
            // Asura chapter images are usually hosted on gg.asuracomic.net (or similar)
            // and often have a path like /storage/media/
            // We exclude common UI elements.
            if (imageUrl.includes('gg.asuracomic.net') &&
                !imageUrl.includes('logo') &&
                !imageUrl.includes('icon') &&
                !imageUrl.includes('thumb') &&
                !imageUrl.includes('avatar') &&
                !imageUrl.includes('cover')) {
                uniqueImages.add(imageUrl);
            }
        });

        return Array.from(uniqueImages);
    }

    private isValidHtml(html: string): boolean {
        if (!html || html.length < 500) return false;
        const blockedIndicators = ['cf-browser-verification', 'Checking your browser', 'Just a moment', 'Verifying you are human', 'cf-challenge'];
        return !blockedIndicators.some(indicator => html.includes(indicator));
    }

    private async fetchHtml(url: string): Promise<string> {
        const isNative = Capacitor.isNativePlatform();

        try {
            if (isNative) {
                const options = {
                    url: url,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.6167.178 Mobile Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                        'Accept-Language': 'en-US,en;q=0.9',
                        'Referer': 'https://asuracomic.net/',
                        'Sec-Ch-Ua': '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
                        'Sec-Ch-Ua-Mobile': '?1',
                        'Sec-Ch-Ua-Platform': '"Android"',
                        'Sec-Fetch-Dest': 'document',
                        'Sec-Fetch-Mode': 'navigate',
                        'Sec-Fetch-Site': 'same-origin',
                        'Sec-Fetch-User': '?1',
                        'Upgrade-Insecure-Requests': '1',
                        'Cache-Control': 'no-cache'
                    },
                    connectTimeout: 30000,
                    readTimeout: 30000
                };
                const response = await CapacitorHttp.get(options);
                const html = response.data || '';

                if (!this.isValidHtml(html)) {
                    console.warn('Asura Scans: Cloudflare challenge detected on mobile.');
                    return '';
                }

                return html;
            } else {
                // Web: try local proxy first, then fallback to corsproxy.io
                try {
                    const localProxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`;
                    const response = await fetch(localProxyUrl, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                            'Accept-Language': 'en-US,en;q=0.9',
                            'Referer': 'https://asuracomic.net/',
                            'Cache-Control': 'no-cache'
                        }
                    });
                    if (response.ok) return await response.text();
                    console.warn(`Local proxy failed (${response.status}) for Asura, trying fallback...`);
                } catch (e) {
                    console.warn('Local proxy error, trying fallback...');
                }

                // Fallback to external CORS proxy
                const fallbackUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
                const response = await fetch(fallbackUrl);
                if (!response.ok) throw new Error(`HTTP ${response.status} via fallback`);
                return await response.text();
            }
        } catch (error) {
            console.error('Asura Scrape Error:', error);
            return '';
        }
    }
}

export const asuraScraperService = new AsuraScraperService();
