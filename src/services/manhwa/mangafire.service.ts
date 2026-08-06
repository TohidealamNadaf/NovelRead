import * as cheerio from 'cheerio';
import type { NovelMetadata } from '../scraper.service';
import { manhwaScraperService } from '../manhwaScraper.service';

const BASE_URL = 'https://mangafire.to';

export class MangaFireHtmlScraper {
    
    // Use existing proxy infrastructure from manhwaScraperService
    private async fetchHtml(url: string, forcePuppeteer = false): Promise<string> {
        return await manhwaScraperService.fetchWithAllProxies(url, forcePuppeteer ? { 'x-force-puppeteer': 'true' } : {});
    }

    /**
     * Fetch a MangaFire AJAX endpoint through the vite proxy.
     * The vite proxy detects `/ajax/` URLs and uses Puppeteer's browser context
     * (with cf_clearance) to call `fetch()` with XHR headers, returning raw JSON.
     */
    private async fetchAjax(ajaxPath: string): Promise<any> {
        const url = `${BASE_URL}${ajaxPath}`;
        const text = await this.fetchHtml(url, true);
        
        try {
            return JSON.parse(text);
        } catch {
            console.warn(`[MangaFire] AJAX response is not JSON for ${ajaxPath}, length=${text.length}`);
            return null;
        }
    }

    // ─── SEARCH (HTML-based, no VRF needed) ───
    async searchManga(query: string): Promise<NovelMetadata[]> {
        const url = `${BASE_URL}/browse?keyword=${encodeURIComponent(query)}&sort=relevance:desc`;
        const html = await this.fetchHtml(url, true); // Force Puppeteer to render SPA
        const $ = cheerio.load(html);
        
        const results: NovelMetadata[] = [];
        
        // MangaFire uses specific classes for items in the new UI
        $('.home-section__item, .title-grid__item, .title-list-item, .filter-item, .title-rows__link').each((_, el) => {
            const $el = $(el);
            const $a = $el.is('a') ? $el : $el.find('a[href*="/title/"]').first();
            const link = $a.attr('href') || '';
            const title = $el.find('.title-row-card__title, h6, .title, strong').first().text().trim() || $el.text().replace(/\n/g, '').trim();
            const cover = $el.find('img').first().attr('src') || 
                         $el.find('img').first().attr('data-src') || '';
            const type = $el.find('.title-row-card__type, .type').first().text().trim();
            
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
        
        console.log(`[MangaFire] Search found ${results.length} results`);
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
            console.error('[MangaFire] Discovery error:', e);
            return { trending: [], popular: [], latest: [] };
        }
    }

    private parseMangaGrid($: cheerio.CheerioAPI, selector: string): NovelMetadata[] {
        const results: NovelMetadata[] = [];
        $(selector).each((_, el) => {
            const $el = $(el);
            const $a = $el.is('a') ? $el : $el.find('a[href*="/title/"]').first();
            const link = $a.attr('href') || '';
            const title = $el.find('.title-row-card__title, h6, .title, strong').first().text().trim() || $el.text().replace(/\n/g, '').trim();
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

    /**
     * Extract the numeric manga ID from a MangaFire URL slug.
     * URL format: /title/92kk8-naruto or /manga/92kk8-naruto
     * The numeric ID is the alphanumeric part before the dash: "92kk8"
     */
    private extractMangaId(url: string): string {
        const urlPath = new URL(url.startsWith('http') ? url : `${BASE_URL}${url}`).pathname;
        // Match /title/{id}-{slug} or /manga/{id}-{slug}
        const match = urlPath.match(/\/(?:title|manga)\/([a-zA-Z0-9]+)/);
        return match ? match[1] : '';
    }

    /**
     * Extract the chapter ID from a MangaFire chapter URL.
     * URL format: /title/92kk8-naruto/chapter/1326884
     * The chapter ID is the numeric part at the end: "1326884"
     */
    private extractChapterId(url: string): string {
        const match = url.match(/\/chapter\/(\d+)/);
        return match ? match[1] : '';
    }

    // ─── METADATA + CHAPTERS (via AJAX API) ───
    // Uses MangaFire's internal AJAX endpoint to get ALL chapters in one call.
    // Endpoint: GET /ajax/read/{numericId}/chapter/en → { result: { html: "..." } }
    async fetchMangaDetails(url: string): Promise<NovelMetadata | null> {
        try {
            // Step 1: Get basic metadata from the title page HTML
            const html = await this.fetchHtml(url, true);
            const $ = cheerio.load(html);
            
            const title = $('h1').first().text().trim();
            
            const cover = $('.poster img, .title-detail__poster img').first().attr('src') || 
                         $('meta[property="og:image"]').attr('content') || '';
            
            const summary = $('.description, .title-detail__synopsis').first().text()
                .replace(/Read more\s*\+?/i, '').trim() || '';
            
            const status = $('.info > p, .title-detail__meta .badge--status').first().text()
                .replace('Releasing', 'Ongoing').trim() || 'Ongoing';
            
            const author = $('div:contains("Author:") a, .title-detail__credits a').first().text().trim() || 'Unknown';
            
            // Step 2: Get ALL chapters via the AJAX API
            const mangaId = this.extractMangaId(url);
            const chapters: { title: string; url: string; date: string }[] = [];
            
            if (mangaId) {
                // Try the AJAX endpoint — returns all chapters in one response (no pagination!)
                const ajaxData = await this.fetchAjax(`/ajax/read/${mangaId}/chapter/en`);
                
                if (ajaxData?.result?.html) {
                    const $ch = cheerio.load(ajaxData.result.html);
                    
                    $ch('li').each((_: number, li) => {
                        const $a = $ch(li).find('a');
                        const dataId = $a.attr('data-id') || '';
                        const dataNumber = $a.attr('data-number') || '';
                        const chTitle = $a.find('span:first-child').text().trim();
                        const releaseDate = $a.find('span:last-child').text().trim();
                        
                        if (dataId) {
                            chapters.push({
                                title: chTitle || `Chapter ${dataNumber}`,
                                // Build the chapter URL using the manga slug and chapter ID
                                url: `${BASE_URL}/title/${mangaId}-${this.slugify(title)}/chapter/${dataId}`,
                                date: releaseDate || ''
                            });
                        }
                    });
                    
                    console.log(`[MangaFire] AJAX returned ${chapters.length} chapters for "${title}"`);
                } else {
                    console.warn(`[MangaFire] AJAX chapter endpoint failed for ${mangaId}, falling back to DOM`);
                }
            }
            
            // Fallback: scrape chapters from the rendered DOM (only gets first 20)
            if (chapters.length === 0) {
                const seenUrls = new Set<string>();
                
                $('.title-detail__chapters a[href*="/chapter/"]').each((_, el) => {
                    const $a = $(el);
                    const href = $a.attr('href') || '';
                    const spans = $a.find('span');
                    let chTitle = '';
                    let date = '';
                    
                    if (spans.length >= 2) {
                        chTitle = spans.eq(0).text().trim();
                        const titleSpan = spans.eq(1).text().trim();
                        if (titleSpan) chTitle += ' - ' + titleSpan;
                        date = spans.last().text().trim();
                    } else {
                        chTitle = $a.text().trim();
                    }
                    
                    if (href && chTitle && !seenUrls.has(href)) {
                        seenUrls.add(href);
                        chapters.push({
                            title: chTitle,
                            url: href.startsWith('http') ? href : `${BASE_URL}${href}`,
                            date: date || ''
                        });
                    }
                });
                
                // Broader fallback
                if (chapters.length === 0) {
                    $('a[href*="/chapter/"]').each((_, el) => {
                        const $a = $(el);
                        const href = $a.attr('href') || '';
                        const chTitle = $a.text().trim();
                        const seenUrls2 = new Set<string>();
                        
                        if (href && chTitle && !seenUrls2.has(href)) {
                            seenUrls2.add(href);
                            chapters.push({
                                title: chTitle,
                                url: href.startsWith('http') ? href : `${BASE_URL}${href}`,
                                date: ''
                            });
                        }
                    });
                }
            }
            
            // Reverse to get Chapter 1 first (chapters come in desc order: 700, 699, ...)
            chapters.reverse();
            
            console.log(`[MangaFire] Found ${chapters.length} chapters for "${title}"`);
            
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
            console.error('[MangaFire] Fetch details error:', e);
            return null;
        }
    }

    // ─── CHAPTER IMAGES (via AJAX API) ───
    // Uses MangaFire's internal AJAX endpoint to get all image URLs in one call.
    // Endpoint: GET /ajax/read/chapter/{chapterId} → { result: { images: [[url, w, h], ...] } }
    async fetchChapterImages(url: string): Promise<{ url: string; width: number; height: number }[]> {
        try {
            const chapterId = this.extractChapterId(url);
            
            if (chapterId) {
                // Primary method: AJAX API
                const ajaxData = await this.fetchAjax(`/ajax/read/chapter/${chapterId}`);
                
                if (ajaxData?.result?.images && Array.isArray(ajaxData.result.images)) {
                    const images = ajaxData.result.images.map((img: any[]) => ({
                        url: img[0],         // Image URL
                        width: img[1] || 0,  // Width
                        height: img[2] || 0  // Height
                    }));
                    
                    console.log(`[MangaFire] AJAX returned ${images.length} images for chapter ${chapterId}`);
                    return images;
                } else {
                    console.warn(`[MangaFire] AJAX image endpoint failed for chapter ${chapterId}, falling back to DOM`);
                }
            }
            
            // Fallback: try to scrape images from the rendered page
            const html = await this.fetchHtml(url, true);
            const $ = cheerio.load(html);
            const images: { url: string; width: number; height: number }[] = [];
            
            // Method 1: Reader images from the rendered SPA
            $('.reader-img, .reader-swiper__img, .reader-swiper__spread img').each((_, el) => {
                const src = $(el).attr('src') || $(el).attr('data-src') || '';
                if (src && this.isContentImage(src)) {
                    const w = parseInt($(el).attr('width') || '0') || 0;
                    const h = parseInt($(el).attr('height') || '0') || 0;
                    images.push({ url: src, width: w, height: h });
                }
            });
            
            // Method 2: Any img inside .reader 
            if (images.length === 0) {
                $('.reader img, .reader-image img, #readerarea img').each((_, el) => {
                    const src = $(el).attr('src') || $(el).attr('data-src') || '';
                    if (src && this.isContentImage(src)) {
                        images.push({ url: src, width: 0, height: 0 });
                    }
                });
            }
            
            // Method 3: Images with CDN URLs
            if (images.length === 0) {
                $('img').each((_, el) => {
                    const src = $(el).attr('src') || $(el).attr('data-src') || '';
                    if (src && this.isContentImage(src) && (src.includes('mfcdn') || src.includes('cdn'))) {
                        images.push({ url: src, width: 0, height: 0 });
                    }
                });
            }
            
            console.log(`[MangaFire] DOM fallback found ${images.length} images`);
            return images;
        } catch (e) {
            console.error('[MangaFire] Fetch images error:', e);
            return [];
        }
    }

    private isContentImage(url: string): boolean {
        if (!url) return false;
        const lower = url.toLowerCase();
        if (lower.includes('logo') || lower.includes('banner') || 
            lower.includes('ads') || lower.includes('icon') ||
            lower.includes('favicon') || lower.includes('.gif') ||
            lower.includes('.svg')) return false;
        return true;
    }

    private slugify(text: string): string {
        return text.toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
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
            const html = await this.fetchHtml(url, true);
            const $ = cheerio.load(html);
            
            return this.parseMangaGrid($, '.unit-item, .manga-item, .title-rows__link');
        } catch (e) {
            console.error('[MangaFire] fetchSeriesList error:', e);
            return [];
        }
    }

    async fetchLatestUpdates(page: number): Promise<NovelMetadata[]> {
        try {
            const url = `${BASE_URL}/browse?sort=recently_updated&page=${page}`;
            const html = await this.fetchHtml(url, true);
            const $ = cheerio.load(html);
            
            return this.parseMangaGrid($, '.unit-item, .manga-item, .title-rows__link');
        } catch (e) {
            console.error('[MangaFire] fetchLatestUpdates error:', e);
            return [];
        }
    }
}

// Export named as mangafireScraperService to keep manhwaScraper.service.ts happy
export const mangafireScraperService = new MangaFireHtmlScraper();
