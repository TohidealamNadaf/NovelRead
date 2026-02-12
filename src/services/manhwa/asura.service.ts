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

            // Skip genres or other non-series links (like direct chapter links)
            if (sourceUrl.includes('?genre=') || sourceUrl.includes('/chapter/')) return;

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

            const isNoise = (t: string) => {
                const upper = t.toUpperCase();
                return !t || upper.includes('BETA SITE') || upper.includes('READ ON OUR') || upper === 'MANHWA' || upper === 'POSTER';
            };

            if (isNoise(title)) {
                // Remove common UI elements and get pure text
                const tempA = a.clone();
                tempA.find('span.status, .status, .type, .px-1, .absolute, .hidden').remove();
                title = tempA.text().trim();
                if (title.includes('\n')) title = title.split('\n')[0].trim();
            }

            // Final fallback to anchor text if still empty
            if (isNoise(title)) title = a.text().trim();

            // Cleanup title (remove extra spaces/newlines, and noisy labels)
            title = title.replace(/\s+/g, ' ').replace('Chapter', '').replace('MANHWA', '').replace('Poster', '').trim();
            if (isNoise(title)) return;

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

            if (href && !href.includes('recruitment') && !href.includes('beta-site')) {
                let title = slide.find('.ellipsis a').text().trim() || slide.find('span.font-bold').text().trim();
                title = title.replace(/\s+/g, ' ').replace('MANHWA', '').trim();

                if (title && !this.isNoiseTitle(title)) {
                    trending.push({
                        title,
                        author: slide.find('.info-left .release-year').text().trim() || 'Asura Scans',
                        coverUrl: slide.find('img[alt="poster"]').attr('src') || '',
                        chapters: [],
                        sourceUrl: href.startsWith('http') ? href : `${BASE_URL}${href.startsWith('/') ? '' : '/'}${href}`,
                        status: slide.find('span.status, .status').text().trim() || 'Ongoing',
                        category: 'Manhwa'
                    });
                }
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

                    // Skip genres, recruitment, or other non-series links
                    if (sourceUrl.includes('?genre=') || sourceUrl.includes('/chapter/') || sourceUrl.includes('recruitment') || sourceUrl.includes('beta-site')) return;

                    // We allow some duplicates if the second link provides a better title/cover
                    const titleRaw = a.find('span.font-bold').text().trim() || a.find('h3').text().trim() || a.text().trim();
                    const title = titleRaw.replace(/\s+/g, ' ').replace('MANHWA', '').replace('Poster', '').trim();
                    const coverUrl = a.find('img').attr('src') || a.find('img').attr('data-src') || a.find('img').attr('data-lazy-src') || '';

                    if ((title && !this.isNoiseTitle(title)) || coverUrl) {
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
        // Refined selector targets the main series grid specifically
        const gridSelector = 'div.grid.grid-cols-2.md\\:grid-cols-5';
        $(gridSelector).find('a[href*="series/"]').each((_, el) => {
            const a = $(el);
            const href = a.attr('href');
            if (!href) return;

            // Ensure absolute URL and deduplicate
            const sourceUrl = href.startsWith('http') ? href : `${BASE_URL}${href.startsWith('/') ? '' : '/'}${href}`;
            if (seenUrls.has(sourceUrl)) return;

            // Skip genres or other non-series links (like direct chapter links)
            if (sourceUrl.includes('?genre=') || sourceUrl.includes('/chapter/')) return;

            seenUrls.add(sourceUrl);

            let title = a.find('span.font-bold').text().trim() ||
                a.find('span.text-white').text().trim() ||
                a.find('h3').text().trim() ||
                a.find('.font-bold').first().text().trim() ||
                a.find('.text-white').first().text().trim();

            const isNoise = (t: string) => this.isNoiseTitle(t);

            if (isNoise(title)) {
                // Try to find a better title inside the anchor by removing noise elements
                const tempA = a.clone();
                tempA.find('span.status, .status, .type, .px-1, .absolute, .hidden, .text-xs, img').remove();
                title = tempA.text().trim();
                if (title.includes('\n')) title = title.split('\n')[0].trim();
            }

            // Cleanup title (remove extra spaces/newlines, and noisy labels)
            title = title.replace(/\s+/g, ' ')
                .replace(/\[.*?\]/g, '') // Remove [Chapter X] tags
                .replace('Chapter', '')
                .replace('MANHWA', '')
                .replace('Poster', '')
                .trim();

            const status = a.find('span.status, .status').text().trim() || 'Ongoing';

            // Final check: if it's still noise or empty, skip this entire entry
            if (isNoise(title) || sourceUrl.includes('recruitment') || sourceUrl.includes('beta-site')) return;

            const coverUrl = a.find('img').attr('src') ||
                a.find('img').attr('data-src') || a.find('img').attr('data-lazy-src') || '';

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

    private isNoiseTitle(t: string): boolean {
        // Aggressive normalization: remove all non-alphanumeric characters
        const upper = (t || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        return !t ||
            upper.includes('BETASITE') ||
            upper.includes('READONOUR') ||
            upper.includes('RECRUITMENT') ||
            upper.includes('JOINOUR') ||
            upper.includes('DISCORD') ||
            upper === 'MANHWA' ||
            upper === 'POSTER' ||
            t.length < 2 ||
            t === 'Unknown Title';
    }

    async fetchMangaDetails(url: string): Promise<NovelMetadata | null> {
        const html = await this.fetchHtml(url);
        if (!html) return null;

        const $ = cheerio.load(html);

        // Help deduplicate repeating text like "ONGOINGONGOING" or "Ongoing Ongoing"
        const dedupeString = (str: string): string => {
            if (!str || str.length < 3) return str;
            // Remove hidden characters and normalize whitespace
            const normalized = str.replace(/[^\x20-\x7E\t\n\r]/g, '').trim().replace(/\s+/g, ' ');

            if (normalized.length < 3) return normalized;

            // Check for space-separated word repetitions e.g. "Ongoing Ongoing"
            const words = normalized.split(' ');
            if (words.length > 1 && words.every(w => w.toLowerCase() === words[0].toLowerCase())) {
                return words[0];
            }

            // Check for joined word repetitions e.g. "ONGOINGONGOING" or "OngoingOngoing"
            // We search for a repeating prefix
            const lower = normalized.toLowerCase();
            for (let i = 1; i <= Math.floor(normalized.length / 2); i++) {
                const sub = lower.substring(0, i);
                let isRepeating = true;
                for (let j = i; j < lower.length; j += i) {
                    const nextPart = lower.substring(j, j + i);
                    if (!sub.startsWith(nextPart) && !nextPart.startsWith(sub)) {
                        isRepeating = false;
                        break;
                    }
                }
                if (isRepeating) {
                    return normalized.substring(0, i);
                }
            }

            return normalized;
        };

        const isNoise = (t: string) => this.isNoiseTitle(t);

        // Multi-layered Title extraction
        // 1. Meta tags (most reliable)
        let title = $('meta[property="og:title"]').attr('content') ||
            $('meta[property="twitter:title"]').attr('content') ||
            $('meta[name="title"]').attr('content') ||
            $('title').text();

        if (title) {
            // Split by common separators and find the first part that isn't noise
            const parts = title.split(/ - | \| | – /).map(p => p.trim());
            const bestPart = parts.find(p => !isNoise(p));
            if (bestPart) {
                title = bestPart;
            } else {
                title = parts[0]; // Fallback to first part if somehow all are noise
            }

            if (title.toUpperCase().startsWith('READ ')) {
                const possible = title.substring(5).trim();
                if (!isNoise(possible)) title = possible;
            }
            if (title.toUpperCase().endsWith(' MANHWA')) title = title.substring(0, title.length - 7).trim();
        }

        // 2. DOM extraction if meta is noise or missing
        if (isNoise(title || '')) {
            title = $('h1').filter((_, el) => !isNoise($(el).text())).first().text().trim() ||
                $('span.text-xl.font-bold').filter((_, el) => !isNoise($(el).text())).first().text().trim() ||
                $('span.text-2xl.font-bold').filter((_, el) => !isNoise($(el).text())).first().text().trim() ||
                $('.text-white.font-bold').filter((_, el) => !isNoise($(el).text())).first().text().trim();
        }

        if (!title || isNoise(title)) {
            // Hard fallback: Try to get it from the URL slug if all else fails
            try {
                const slug = url.split('/').filter(Boolean).pop();
                if (slug && !slug.includes('beta-site')) {
                    title = slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                }
            } catch (e) { }
        }

        if (!title || isNoise(title)) title = 'Unknown Title';

        let coverUrl = '';
        // Prioritize the actual poster image and avoid banners
        $('img[alt="poster"]').each((_, el) => {
            const src = $(el).attr('src');
            if (src && !src.includes('banner') && !src.includes('logo')) {
                coverUrl = src;
                return false;
            }
        });

        let author = 'Unknown';
        let status = 'Unknown';

        // Loop through the grid-cols-2 items for Status and Type, or other metadata
        // Status is explicitly labeled
        $('div.bg-\\[\\#343434\\], div.bg-\\[\\#222222\\], .grid div').each((_, el) => {
            const h3s = $(el).find('h3');
            if (h3s.length >= 2) {
                const label = h3s.first().text().trim();
                let value = h3s.last().text().trim();

                value = dedupeString(value);

                if (label.includes('Status')) status = value;
                if (label.includes('Author') && (author === 'Unknown' || !author)) author = value;
            }
        });

        // Fallback author search
        if (author === 'Unknown') {
            $('.grid div').each((_, el) => {
                const h3s = $(el).find('h3');
                if (h3s.length >= 2) {
                    const label = h3s.first().text().trim();
                    const value = dedupeString(h3s.last().text().trim());
                    if (label.includes('Author')) author = value;
                }
            });
        }

        let summary = $('span.font-medium.text-sm p').text().trim();
        if (!summary) {
            summary = $('div.text-sm.font-medium.opacity-80').text().trim();
        }
        if (!summary) {
            summary = $('span.font-medium.text-sm').first().text().trim();
        }

        const chapters: { title: string; url: string; date?: string }[] = [];

        // Chapter list container
        // Selector: div.overflow-y-auto a
        $('div.overflow-y-auto a').each((_, el) => {
            const link = $(el).attr('href');
            const h3s = $(el).find('h3');

            if (h3s.length > 0) {
                // Asura might have: h3(Name), h3(Chapter #), h3(Date)
                // Filter out labels like "MANHWA"
                const texts = h3s.map((_, h) => $(h).text().trim().replace('MANHWA', '')).get().filter(Boolean);

                let chapTitle = texts[0] || 'Unknown Chapter';
                let subLabel = texts.length > 1 ? texts[1] : '';
                let dateLabel = texts.length > 2 ? texts[2] : '';

                // 1. Aggressive Clean for "First Chapter" and "New Chapter"
                // Handle cases like "First ChapterChapter 1" or just "New Chapter"
                if (chapTitle.match(/^(First|New)\s*Chapter/i)) {
                    // Try to strip the prefix
                    const cleaned = chapTitle.replace(/^(First|New)\s*Chapter/i, '').trim();
                    // If result starts with "Chapter", use it. If empty, try subLabel.
                    if (cleaned.toLowerCase().startsWith('chapter') || cleaned.match(/^\d/)) {
                        chapTitle = cleaned;
                    } else if (subLabel && subLabel.toLowerCase().includes('chapter')) {
                        // Fallback to subLabel if main title was just "First Chapter"
                        chapTitle = subLabel;
                        subLabel = '';
                    }
                    // Force fix for "ChapterChapter" concatenation artifact if it happened
                    chapTitle = chapTitle.replace(/ChapterChapter/i, 'Chapter');
                }

                // 2. Identify Date
                // If subLabel is actually a date (starts with month/number), and dateLabel is empty
                if (subLabel && !dateLabel && (subLabel.match(/^[A-Za-z]+ \d+/) || subLabel.match(/^\d+/))) {
                    dateLabel = subLabel;
                    subLabel = '';
                }

                // 3. Merge Intelligent
                // If subLabel is not empty and not just a date, append it
                if (subLabel) {
                    if (subLabel.toLowerCase().includes('chapter') && !chapTitle.toLowerCase().includes('chapter')) {
                        chapTitle = `${subLabel}: ${chapTitle}`;
                    } else if (!chapTitle.includes(subLabel)) {
                        chapTitle = `${chapTitle} ${subLabel}`;
                    }
                }

                if (link) {
                    const chapterUrl = link.startsWith('http') ? link : `${BASE_URL}/series/${link}`;

                    // Clean up title
                    chapTitle = chapTitle.replace(/\s+/g, ' ').trim();

                    chapters.push({
                        title: chapTitle,
                        url: chapterUrl,
                        date: dateLabel // Store date separately
                    });
                }
            }
        });

        // Robust Numeric Sort
        // Extracts the first number found in the title for sorting
        chapters.sort((a, b) => {
            const getNum = (t: string) => {
                // Match any number (int or float)
                const match = t.match(/(\d+(\.\d+)?)/);
                return match ? parseFloat(match[1]) : 0;
            };
            return getNum(a.title) - getNum(b.title);
        });

        return {
            title,
            author,
            coverUrl,
            status,
            summary,
            category: 'Manhwa',
            chapters: chapters, // Already sorted Oldest -> Newest
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
