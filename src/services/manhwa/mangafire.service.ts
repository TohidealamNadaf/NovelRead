import * as cheerio from 'cheerio';
import type { NovelMetadata } from '../scraper.service';
import { manhwaScraperService } from '../manhwaScraper.service';

const BASE_URL = 'https://mangafire.to';

export class MangaFireHtmlScraper {
    
    // Use existing proxy infrastructure from manhwaScraperService
    private async fetchHtml(url: string): Promise<string> {
        return await manhwaScraperService.fetchWithAllProxies(url);
    }

    // ─── SEARCH (HTML-based, no VRF needed) ───
    async searchManga(query: string): Promise<NovelMetadata[]> {
        const url = `${BASE_URL}/browse?keyword=${encodeURIComponent(query)}&sort=relevance:desc`;
        const html = await this.fetchHtml(url);
        const $ = cheerio.load(html);
        
        const results: NovelMetadata[] = [];
        
        // MangaFire uses specific classes for items in the new UI
        $('.home-section__item, .title-grid__item, .title-list-item, .filter-item').each((_, el) => {
            const $el = $(el);
            const $a = $el.find('a[href*="/title/"]').first();
            const link = $a.attr('href') || '';
            const title = $el.find('h6, .title, strong').first().text().trim() || $el.text().replace(/\n/g, '').trim();
            const cover = $el.find('img').first().attr('src') || 
                         $el.find('img').first().attr('data-src') || '';
            const type = $el.find('.type').first().text().trim();
            
            if (title && link) {
                results.push({
                    title,
                    author: 'Unknown',
                    coverUrl: cover.startsWith('http') ? cover : `${BASE_URL}${cover}`,
                    category: type || 'Manga',
                    status: 'Ongoing',
                    sourceUrl: link.startsWith('http') ? link : `${BASE_URL}${link}`,
                    chapters: []
                });
            }
        });
        
        console.log(`[MangaFireHtml] Search found ${results.length} results`);
        return results;
    }

    // ─── DISCOVERY (HTML-based) ───
    async getDiscoverManga(): Promise<{ trending: NovelMetadata[], popular: NovelMetadata[], latest: NovelMetadata[] }> {
        try {
            const html = await this.fetchHtml(`${BASE_URL}/home`);
            const $ = cheerio.load(html);
            
            const trending = this.parseMangaGrid($, '.swiper-slide .home-section__item');
            const popular = this.parseMangaGrid($, '.title-grid__item, .title-list-item');
            const latest = this.parseMangaGrid($, '.home-section__item:not(.swiper-slide)');
            
            // Fallback: if sections not found, try generic selectors
            const allItems = this.parseMangaGrid($, '.home-section__item, .title-grid__item, .filter-item');
            
            return {
                trending: trending.length > 0 ? trending : allItems.slice(0, 10),
                popular: popular.length > 0 ? popular : allItems.slice(10, 20),
                latest: latest.length > 0 ? latest : allItems.slice(20, 30)
            };
        } catch (e) {
            console.error('[MangaFireHtml] Discovery error:', e);
            return { trending: [], popular: [], latest: [] };
        }
    }

    private parseMangaGrid($: cheerio.CheerioAPI, selector: string): NovelMetadata[] {
        const results: NovelMetadata[] = [];
        $(selector).each((_, el) => {
            const $el = $(el);
            const $a = $el.find('a[href*="/title/"]').first();
            const link = $a.attr('href') || '';
            const title = $el.find('h6, .title, strong').first().text().trim() || $el.text().replace(/\n/g, '').trim();
            const cover = $el.find('img').first().attr('src') || 
                         $el.find('img').first().attr('data-src') || '';
            
            if (title && link) {
                results.push({
                    title,
                    author: 'Unknown',
                    coverUrl: cover.startsWith('http') ? cover : `${BASE_URL}${cover}`,
                    category: 'Manga',
                    status: 'Ongoing',
                    sourceUrl: link.startsWith('http') ? link : `${BASE_URL}${link}`,
                    chapters: []
                });
            }
        });
        return results;
    }

    // ─── METADATA + CHAPTERS (from title page HTML) ───
    async fetchMangaDetails(url: string): Promise<NovelMetadata | null> {
        try {
            const html = await this.fetchHtml(url);
            const $ = cheerio.load(html);
            
            const title = $('h1.title-detail__title').first().text().trim() || $('h1').first().text().trim();
            const cover = $('.title-detail__poster img').attr('src') || 
                         $('.title-detail__banner-img').attr('src') || 
                         $('meta[property="og:image"]').attr('content') || '';
            
            const summary = $('.title-detail__synopsis p').first().text().trim() || $('.modal-body p').first().text().trim() || '';
            const status = $('.title-detail__meta .badge--status').first().text().replace('Releasing', 'Ongoing').trim() || 'Ongoing';
            const author = $('.title-detail__credits a').first().text().trim() || 'Unknown';
            
            // Extract chapters from the title page
            const chapters: { title: string; url: string; date: string }[] = [];
            const seenUrls = new Set<string>();
            
            // MangaFire title page has chapter list in various formats
            $('.title-detail__row-link, .chapter-list a, .chapters a').each((_, el) => {
                const $a = $(el);
                const href = $a.attr('href') || '';
                const chTitle = $a.find('.title-detail__row-num').text().trim() || $a.text().trim() || $a.attr('title') || '';
                
                if (href && chTitle && !seenUrls.has(href)) {
                    seenUrls.add(href);
                    chapters.push({
                        title: chTitle,
                        url: href.startsWith('http') ? href : `${BASE_URL}${href}`,
                        date: ''
                    });
                }
            });
            
            // If no chapters found, try alternative selectors
            if (chapters.length === 0) {
                $('a[href*="/read/"], a[href*="/chapter/"]').each((_, el) => {
                    const $a = $(el);
                    const href = $a.attr('href') || '';
                    const chTitle = $a.find('.title-detail__row-num').text().trim() || $a.text().trim();
                    
                    if (href && chTitle && !seenUrls.has(href)) {
                        seenUrls.add(href);
                        chapters.push({
                            title: chTitle,
                            url: href.startsWith('http') ? href : `${BASE_URL}${href}`,
                            date: ''
                        });
                    }
                });
            }
            
            // Reverse to get Chapter 1 first
            chapters.reverse();
            
            return {
                title: title || 'Unknown',
                author,
                coverUrl: cover,
                category: 'Manga',
                status,
                summary,
                sourceUrl: url,
                chapters
            };
        } catch (e) {
            console.error('[MangaFireHtml] Fetch details error:', e);
            return null;
        }
    }

    // ─── CHAPTER IMAGES (from read page HTML) ───
    async fetchChapterImages(url: string): Promise<{ url: string; width: number; height: number }[]> {
        try {
            const html = await this.fetchHtml(url);
            const $ = cheerio.load(html);
            
            const images: { url: string; width: number; height: number }[] = [];
            
            // Method 1: Direct img tags in reader
            $('.reader-image img, #readerarea img, .page-img img').each((_, el) => {
                const src = $(el).attr('src') || $(el).attr('data-src') || '';
                if (src && this.isContentImage(src)) {
                    images.push({ url: src, width: 0, height: 0 });
                }
            });
            
            // Method 2: JSON data embedded in script tags
            if (images.length === 0) {
                $('script').each((_, el) => {
                    const text = $(el).html() || '';
                    
                    // Look for image array patterns
                    const patterns = [
                        /"images"\s*:\s*(\[[^\]]+\])/,
                        /"pages"\s*:\s*(\[[^\]]+\])/,
                        /var\s+images\s*=\s*(\[[^\]]+\])/,
                        /var\s+pages\s*=\s*(\[[^\]]+\])/
                    ];
                    
                    for (const pattern of patterns) {
                        const match = text.match(pattern);
                        if (match) {
                            try {
                                const parsed = JSON.parse(match[1]);
                                parsed.forEach((item: any) => {
                                    const url = typeof item === 'string' ? item : item.url || item.src;
                                    if (url && this.isContentImage(url)) {
                                        images.push({ url, width: item.width || 0, height: item.height || 0 });
                                    }
                                });
                            } catch (e) {}
                        }
                    }
                });
            }
            
            // Method 3: data-src attributes (lazy loaded)
            if (images.length === 0) {
                $('img[data-src]').each((_, el) => {
                    const src = $(el).attr('data-src') || '';
                    if (src && this.isContentImage(src)) {
                        images.push({ url: src, width: 0, height: 0 });
                    }
                });
            }
            
            console.log(`[MangaFireHtml] Found ${images.length} images`);
            return images;
        } catch (e) {
            console.error('[MangaFireHtml] Fetch images error:', e);
            return [];
        }
    }

    private isContentImage(url: string): boolean {
        if (!url) return false;
        const lower = url.toLowerCase();
        // Exclude common non-content images
        if (lower.includes('logo') || lower.includes('banner') || 
            lower.includes('ads') || lower.includes('icon') ||
            lower.includes('.gif')) return false;
        return true;
    }

    // --- Added missing methods to satisfy manhwaScraper.service.ts ---
    async fetchMetadata(url: string): Promise<NovelMetadata | null> {
        return this.fetchMangaDetails(url);
    }

    async fetchChapterList(url: string): Promise<{ title: string; url: string; date: string }[]> {
        const details = await this.fetchMangaDetails(url);
        return (details?.chapters || []).map(ch => ({
            title: ch.title,
            url: ch.url,
            date: ch.date || ''
        }));
    }

    async fetchSeriesList(page: number): Promise<NovelMetadata[]> {
        try {
            const url = `${BASE_URL}/browse?sort=trending&page=${page}`;
            const html = await this.fetchHtml(url);
            const $ = cheerio.load(html);
            return this.parseMangaGrid($, '.unit-item, .manga-item');
        } catch(e) {
            console.error('[MangaFireHtml] fetchSeriesList error:', e);
            return [];
        }
    }

    async fetchLatestUpdates(page: number): Promise<NovelMetadata[]> {
        try {
            const url = `${BASE_URL}/browse?sort=recently_updated&page=${page}`;
            const html = await this.fetchHtml(url);
            const $ = cheerio.load(html);
            return this.parseMangaGrid($, '.unit-item, .manga-item');
        } catch(e) {
            console.error('[MangaFireHtml] fetchLatestUpdates error:', e);
            return [];
        }
    }
}

// Export named as mangafireScraperService to keep manhwaScraper.service.ts happy
export const mangafireScraperService = new MangaFireHtmlScraper();
