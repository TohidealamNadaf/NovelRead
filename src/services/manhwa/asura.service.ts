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

        // Find all links containing /series/ (results are typically in a grid)
        // We avoid strict parent selectors like 'div.grid' which may change on mobile
        $('a[href*="/series/"]').each((_, el) => {
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
            // 3. Fallback to anchor text itself
            let title = a.find('span.font-bold').text().trim() ||
                a.find('span.text-white').text().trim() ||
                a.find('h3').text().trim() ||
                a.find('div.font-bold').first().text().trim();

            if (!title) {
                const tempA = a.clone();
                tempA.find('span.status, .status, .type, .px-1').remove();
                title = tempA.text().trim().split('\n')[0].trim();
            }

            // Cleanup title (remove extra spaces/newlines)
            title = title.replace(/\s+/g, ' ').trim();

            // Flexible image extraction
            const img = a.find('img');
            const coverUrl = img.attr('src') || img.attr('data-src') || img.attr('data-lazy-src') || '';

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
            chapters: chapters,
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
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.5',
                        'Referer': 'https://asuracomic.net/',
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
                const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`;
                const response = await fetch(proxyUrl);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return await response.text();
            }
        } catch (error) {
            console.error('Asura Scrape Error:', error);
            return '';
        }
    }
}

export const asuraScraperService = new AsuraScraperService();
