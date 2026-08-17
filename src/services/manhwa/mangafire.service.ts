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
     * Fetch a MangaFire AJAX endpoint.
     * Sends proper XHR headers so the server returns JSON (not an HTML challenge).
     * Skips HTML validation since the response is JSON, not a web page.
     */
    private async fetchAjax(ajaxPath: string, refererUrl?: string): Promise<any> {
        const url = `${BASE_URL}${ajaxPath}`;
        const referer = refererUrl || `${BASE_URL}/`;
        
        // Proper AJAX/XHR headers — without these, MangaFire returns
        // an HTML page or Cloudflare challenge instead of JSON.
        const text = await manhwaScraperService.fetchWithAllProxies(url, {
            'x-force-puppeteer': 'true',
            'X-Requested-With': 'XMLHttpRequest',
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'Referer': referer,
        }, true); // skipValidation = true → JSON isn't HTML, skip isValidHtml
        
        if (!text || text.length < 2) {
            console.warn(`[MangaFire] AJAX returned empty for ${ajaxPath}`);
            return null;
        }
        
        try {
            return JSON.parse(text);
        } catch {
            console.warn(`[MangaFire] AJAX response is not JSON for ${ajaxPath}, length=${text.length}`);
            return null;
        }
    }

    // ─── SEARCH (HTML-based, no VRF needed) ───
    async searchManga(query: string): Promise<NovelMetadata[]> {
        const url = `${BASE_URL}/filter?keyword=${encodeURIComponent(query)}`;
        const html = await this.fetchHtml(url, true); // Force Puppeteer if available
        const $ = cheerio.load(html);
        
        const results: NovelMetadata[] = [];
        
        $('.unit-item, .manga-item, .inner-item, .item, .title-grid__item, .title-list-item, .filter-item, .home-section__item, .title-rows__link').each((_, el) => {
            const $el = $(el);
            const $a = $el.is('a') ? $el : $el.find('a[href*="/title/"], a[href*="/manga/"]').first();
            const link = $a.attr('href') || '';
            const title = $el.find('.title-row-card__title, .info a, .name, .title, h6, strong').first().text().trim() || $a.attr('title') || $el.text().replace(/\n/g, '').trim();
            const cover = $el.find('img').first().attr('src') || 
                         $el.find('img').first().attr('data-src') || 
                         $el.find('img').first().attr('data-lazy-src') || '';
            const type = $el.find('.title-row-card__type, .type, .badge').first().text().trim();
            
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

    private mapApiItem(item: any): NovelMetadata {
        const slug = item.slug || '';
        const hid = item.hid || item.id || '';
        const sourceUrl = slug ? `${BASE_URL}/manga/${slug}.${hid}` : `${BASE_URL}/title/${hid}`;
        const cover = item.poster?.medium || item.poster?.small || item.poster?.large || '';
        return {
            title: item.title || 'Unknown Title',
            author: 'MangaFire',
            coverUrl: cover.startsWith('http') ? cover : `${BASE_URL}${cover}`,
            category: item.type ? (item.type.charAt(0).toUpperCase() + item.type.slice(1)) : 'Manga',
            status: item.status === 'releasing' ? 'Ongoing' : 'Completed',
            sourceUrl,
            chapters: []
        };
    }

    // ─── DISCOVERY (Official REST API + HTML Fallback) ───
    async getDiscoverManga(): Promise<{ trending: NovelMetadata[], popular: NovelMetadata[], latest: NovelMetadata[] }> {
        try {
            const [tRes, pRes, lRes] = await Promise.all([
                this.fetchAjax('/api/top-titles?type=trending&days=1&limit=30').catch(() => null),
                this.fetchAjax('/api/top-titles?type=trending&days=7&limit=30').catch(() => null),
                this.fetchAjax('/api/top-titles?type=trending&days=365&limit=30').catch(() => null),
            ]);

            const trending = (tRes?.items || []).map((item: any) => this.mapApiItem(item));
            const popular = (pRes?.items || []).map((item: any) => this.mapApiItem(item));
            const latest = (lRes?.items || []).map((item: any) => this.mapApiItem(item));

            if (trending.length > 0 || popular.length > 0 || latest.length > 0) {
                console.log(`[MangaFire] Loaded discovery API items directly: trending=${trending.length}, popular=${popular.length}, latest=${latest.length}`);
                return { trending, popular, latest };
            }
        } catch (e) {
            console.warn('[MangaFire] API discovery failed, trying HTML parsing:', e);
        }

        try {
            const html = await this.fetchHtml(`${BASE_URL}`);
            const $ = cheerio.load(html);
            
            const trending = this.parseMangaGrid($, '.swiper-slide .unit-item, .swiper-slide .manga-item, .swiper-slide .home-section__item, .swiper-slide .item');
            const popular = this.parseMangaGrid($, '.title-grid__item, .title-list-item, .unit-item, .item');
            const latest = this.parseMangaGrid($, '.home-section__item:not(.swiper-slide), .unit-item, .manga-item, .item');
            
            const allItems = this.parseMangaGrid($, '.unit-item, .manga-item, .inner-item, .item, .home-section__item, .title-grid__item, .filter-item, a[href*="/title/"], a[href*="/manga/"]');
            
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

    async fetchSeriesList(page: number): Promise<NovelMetadata[]> {
        try {
            const data = await this.fetchAjax(`/api/top-titles?type=trending&days=365&limit=30&page=${page}`);
            if (data?.items && data.items.length > 0) {
                return data.items.map((item: any) => this.mapApiItem(item));
            }
        } catch (e) {}
        return [];
    }

    async fetchLatestUpdates(page: number): Promise<NovelMetadata[]> {
        try {
            const data = await this.fetchAjax(`/api/top-titles?type=trending&days=1&limit=30&page=${page}`);
            if (data?.items && data.items.length > 0) {
                return data.items.map((item: any) => this.mapApiItem(item));
            }
        } catch (e) {}
        return [];
    }

    private parseMangaGrid($: cheerio.CheerioAPI, selector: string): NovelMetadata[] {
        const results: NovelMetadata[] = [];
        $(selector).each((_, el) => {
            const $el = $(el);
            const $a = $el.is('a') ? $el : $el.find('a[href*="/title/"], a[href*="/manga/"]').first();
            const link = $a.attr('href') || '';
            const title = $el.find('.title-row-card__title, .info a, .name, .title, h6, strong').first().text().trim() || $a.attr('title') || $el.text().replace(/\n/g, '').trim();
            const cover = $el.find('img').first().attr('src') || 
                         $el.find('img').first().attr('data-src') || 
                         $el.find('img').first().attr('data-lazy-src') || '';
            
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
     * URL format: /manga/naruto.92kk8 or /title/naruto.92kk8 or /manga/naruto-92kk8
     * The numeric/alphanumeric ID is the part after the last dot or dash: "92kk8"
     */
    private extractMangaId(url: string): string {
        if (!url) return '';
        const cleanUrl = url.split('?')[0].split('#')[0].replace(/\/$/, '');
        const match = cleanUrl.match(/[\.\-]([a-zA-Z0-9]+)$/) || cleanUrl.match(/\/([a-zA-Z0-9]+)$/);
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
            
            // Step 1: Check if proxy injected __MANGAFIRE_DATA__ JSON from network interception
            const injectedJson = $('#__MANGAFIRE_DATA__').html();
            if (injectedJson) {
                try {
                    const parsed = JSON.parse(injectedJson);
                    const meta = parsed.meta || {};
                    const rawChapters = parsed.chapters || [];
                    
                    if (rawChapters.length > 0) {
                        const title = meta.title || $('h1').first().text().trim() || 'Manga';
                        const cover = meta.poster?.medium || meta.poster?.small || $('.poster img').first().attr('src') || '';
                        const summary = meta.synopsis || $('.description').first().text().trim() || '';
                        const status = meta.status || 'Ongoing';
                        const author = (meta.authors && meta.authors.length > 0) ? meta.authors.join(', ') : 'Unknown';

                        const chapters = rawChapters.map((ch: any) => ({
                            title: ch.title,
                            url: ch.url || `${BASE_URL}/read/${ch.id}`,
                            date: ch.date || ''
                        }));

                        console.log(`[MangaFire] Proxy intercepted ${chapters.length} chapters for "${title}"`);

                        return {
                            title,
                            author,
                            coverUrl: cover.startsWith('http') ? cover : `${BASE_URL}${cover}`,
                            category: 'Manga',
                            status,
                            summary,
                            sourceUrl: url,
                            chapters
                        };
                    }
                } catch (e) {
                    console.warn('[MangaFire] Error parsing injected JSON:', e);
                }
            }

            let title = $('h1').first().text().trim();
            if (!title) {
                const slugPart = url.split('?')[0].split('#')[0].replace(/\/$/, '').split('/').pop() || '';
                title = slugPart.replace(/[\.\-][a-zA-Z0-9]+$/, '').replace(/[\-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'Manga';
            }
            
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
                const ajaxData = await this.fetchAjax(`/ajax/read/${mangaId}/chapter/en`, url);
                
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
}

// Export named as mangafireScraperService to keep manhwaScraper.service.ts happy
export const mangafireScraperService = new MangaFireHtmlScraper();
