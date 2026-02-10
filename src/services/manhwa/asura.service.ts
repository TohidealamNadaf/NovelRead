import { CapacitorHttp } from '@capacitor/core';
import { Capacitor } from '@capacitor/core';
import * as cheerio from 'cheerio';
import type { NovelMetadata } from '../scraper.service';

const BASE_URL = 'https://asuratoon.com';

export class AsuraScraperService {
    async searchManga(query: string): Promise<NovelMetadata[]> {
        const url = `${BASE_URL}/?s=${encodeURIComponent(query)}`;
        const html = await this.fetchHtml(url);
        if (!html) return [];

        const $ = cheerio.load(html);
        const results: NovelMetadata[] = [];

        $('.bsx').each((_, el) => {
            const a = $(el).find('a');
            const href = a.attr('href');
            const title = a.attr('title') || $(el).find('.tt').text().trim();
            const coverUrl = $(el).find('img').attr('src');

            if (href && title) {
                results.push({
                    title,
                    author: 'Asura Scans',
                    coverUrl: coverUrl || '',
                    chapters: [],
                    sourceUrl: href,
                    sourceId: href,
                    status: 'Ongoing'
                });
            }
        });

        return results;
    }

    async fetchMangaDetails(url: string): Promise<NovelMetadata | null> {
        const html = await this.fetchHtml(url);
        if (!html) return null;

        const $ = cheerio.load(html);

        const title = $('.entry-title').first().text().trim();
        const coverUrl = $('.thumb img').attr('src') || '';
        const author = $('.fmed').filter((_, el) => $(el).find('b').text().includes('Author')).find('span').text().trim() || 'Unknown';
        const status = $('.tsinfo .imptdt').filter((_, el) => $(el).find('i').text().includes('Status')).find('i').text().replace('Status', '').trim() || 'Unknown';
        const summary = $('.entry-content').text().trim();

        const chapters: { title: string; url: string }[] = [];
        $('#chapterlist li').each((_, el) => {
            const link = $(el).find('a').attr('href');
            const chapTitle = $(el).find('.chapternum').text().trim();
            const date = $(el).find('.chapterdate').text().trim();

            if (link) {
                chapters.push({
                    title: chapTitle + (date ? ` (${date})` : ''),
                    url: link
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

        const $ = cheerio.load(html);
        const images: string[] = [];

        $('#readerarea img').each((_, el) => {
            const src = $(el).attr('src') || $(el).attr('data-src');
            if (src) images.push(src);
        });

        return images;
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
                const proxyUrl = `https://corsproxy.io/?url=${encodeURIComponent(url)}`;
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
