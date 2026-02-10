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

        // Select the grid items. The grid container usually has grid-cols-2 etc.
        // We look for <a> tags inside the main content area that link to series.
        // Based on debug HTML: div.grid.grid-cols-2... > a
        $('div.grid a[href*="/series/"]').each((_, el) => {
            const href = $(el).attr('href');
            const title = $(el).find('span.font-bold').text().trim();
            const coverUrl = $(el).find('img').attr('src');
            const status = $(el).find('span.status').text().trim() || 'Ongoing';

            if (href && title) {
                // Ensure absolute URL
                const sourceUrl = href.startsWith('http') ? href : `${BASE_URL}${href.startsWith('/') ? '' : '/'}${href}`;

                results.push({
                    title,
                    author: 'Asura Scans',
                    coverUrl: coverUrl || '',
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

    private async fetchHtml(url: string): Promise<string> {
        const isNative = Capacitor.isNativePlatform();

        try {
            if (isNative) {
                const options = {
                    url: url,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
                    }
                };
                const response = await CapacitorHttp.get(options);
                return response.data;
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
