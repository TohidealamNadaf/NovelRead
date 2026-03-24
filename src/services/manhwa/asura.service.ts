import { CapacitorHttp } from '@capacitor/core';
import { Capacitor } from '@capacitor/core';
import * as cheerio from 'cheerio';
import type { NovelMetadata } from '../scraper.service';

const BASE_URL = 'https://asurascans.com';

export class AsuraScraperService {
    async searchManga(query: string): Promise<NovelMetadata[]> {
        const url = `${BASE_URL}/browse?search=${encodeURIComponent(query)}`;
        const html = await this.fetchHtml(url);
        if (!html) return [];

        const $ = cheerio.load(html);
        const results: NovelMetadata[] = [];
        const seenUrls = new Set<string>();

        // Find all links containing series/ (results are typically in a grid)
        // We avoid strict parent selectors like 'div.grid' which may change on mobile
        $('a[href*="/comics/"]').each((_, el) => {
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
        const seenUrls = new Set<string>();

        // Extract a single manhwa item from an anchor element
        const extractItem = (a: any, parentEl?: any): NovelMetadata | null => {
            const href = a.attr('href') || '';
            if (!href || !href.includes('/comics/')) return null;
            if (href.includes('/chapter/') || href.includes('recruitment') || href.includes('beta-site') || href.includes('?genre=')) return null;

            let sourceUrl = href.startsWith('http') ? href : `${BASE_URL}${href.startsWith('/') ? '' : '/'}${href}`;
            
            // Clean dynamic build hash suffixes (-f6174291) to ensure stable URLs
            sourceUrl = sourceUrl.replace(/-f[a-f0-9]{8}$/i, '');
            
            if (seenUrls.has(sourceUrl)) return null;

            // Title: Prefer h3 (actual title), then font-bold text, then direct text
            // SKIP spans that are just ratings (numeric like "9.3")
            let title = a.find('h3').first().text().trim()
                || a.find('.font-bold').first().text().trim()
                || a.find('span.font-bold').first().text().trim();

            // If we got a rating as title, try harder
            if (!title || this.isRating(title)) {
                // Try all spans and find one that's not a rating
                a.find('span').each((_: number, span: any) => {
                    const t = $(span).text().trim();
                    if (t && !this.isRating(t) && !this.isNoiseTitle(t) && t.length > 2) {
                        title = t;
                        return false; // break
                    }
                });
            }

            // Final fallback: use the direct text 
            if (!title || this.isRating(title)) {
                title = a.text().trim().split('\n')[0].trim();
            }

            title = title.replace(/\s+/g, ' ').replace('MANHWA', '').replace('Poster', '').trim();
            if (!title || this.isNoiseTitle(title) || this.isRating(title)) return null;

            // Cover: try img inside the anchor first
            let img = a.find('img').first();
            let coverUrl = img.attr('src') || img.attr('data-src') || img.attr('data-lazy-src') || '';

            // If no image inside the anchor, check sibling elements (for Latest Updates layout)
            if (!coverUrl && parentEl) {
                const siblingImg = parentEl.find('img').first();
                coverUrl = siblingImg.attr('src') || siblingImg.attr('data-src') || '';
            }

            seenUrls.add(sourceUrl);
            return {
                title,
                author: 'Asura Scans',
                coverUrl,
                chapters: [],
                sourceUrl,
                status: 'Ongoing',
                category: 'Manhwa'
            };
        };

        // ---- 1. Trending: top carousel/slider ----
        // New structure uses a.slide-link or a.block.group
        $('a[href*="/comics/"].slide-link, a.block.group[href*="/comics/"], a.block.cursor-pointer[href*="/comics/"]').each((_, el) => {
            const item = extractItem($(el));
            if (item && trending.length < 15) trending.push(item);
        });

        // Fallback: li.slide (old structure)
        if (trending.length === 0) {
            $('li.slide a[href*="/comics/"]').each((_, el) => {
                const item = extractItem($(el));
                if (item && trending.length < 15) trending.push(item);
            });
        }

        // ---- 2. Latest Updates ----
        // New structure: grid items where image and title are in sibling elements
        // Find all grid rows that contain /comics/ links
        $('a.font-bold[href*="/comics/"], a[class*="font-bold"][href*="/comics/"]').each((_, el) => {
            const a = $(el);
            // Find the parent grid row to also grab the cover image
            const gridRow = a.closest('[class*="grid"], [class*="col-span"]').parent();
            const item = extractItem(a, gridRow);
            if (item && latest.length < 20) latest.push(item);
        });

        // If Latest is still empty, try broader approach
        if (latest.length === 0) {
            // Find "Latest Updates" text and extract nearby links
            $('*').filter((_, el) => {
                const t = $(el).clone().children().remove().end().text().trim();
                return t === 'Latest Updates' || t.includes('Latest');
            }).each((_, headerEl) => {
                const container = $(headerEl).parent().parent().parent();
                container.find('a[href*="/comics/"]').each((_, el) => {
                    const a = $(el);
                    if (a.attr('href')?.includes('/chapter/')) return; // skip chapter links
                    const row = a.closest('[class*="grid"]').parent();
                    const item = extractItem(a, row);
                    if (item && latest.length < 20) latest.push(item);
                });
            });
        }

        // ---- 3. Popular (sidebar) ----
        // Popular items may not have <a> tags; try to extract from sidebar by text
        $('*').filter((_, el) => {
            const t = $(el).clone().children().remove().end().text().trim();
            return t === 'Popular';
        }).each((_, headerEl) => {
            const container = $(headerEl).parent().parent().parent();
            container.find('a[href*="/comics/"]').each((_, el) => {
                const item = extractItem($(el));
                if (item && popular.length < 15) popular.push(item);
            });
        });

        // ---- 4. Broad fallback ----
        if (trending.length === 0 && latest.length === 0) {
            const allLinks: NovelMetadata[] = [];
            $('a[href*="/comics/"]').each((_, el) => {
                const item = extractItem($(el));
                if (item) allLinks.push(item);
            });

            const half = Math.ceil(allLinks.length / 2);
            trending.push(...allLinks.slice(0, Math.min(15, half)));
            latest.push(...allLinks.slice(half, half + 20));
        }

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
        const url = `${BASE_URL}/browse?page=${page}`;
        const html = await this.fetchHtml(url);
        if (!html) return [];

        const $ = cheerio.load(html);
        const results: NovelMetadata[] = [];
        const seenUrls = new Set<string>();

        // Find all items in the series list grid
        // Refined selector targets the main series grid specifically
        const gridSelector = 'div.grid';
        $(gridSelector).find('a[href*="/comics/"]').each((_, el) => {
            const a = $(el);
            const href = a.attr('href');
            if (!href) return;

            // Ensure absolute URL and deduplicate
            const sourceUrl = href.startsWith('http') ? href : `${BASE_URL}${href.startsWith('/') ? '' : '/'}${href}`;
            if (seenUrls.has(sourceUrl)) return;

            // Skip genres or other non-series links (like direct chapter links)
            if (sourceUrl.includes('?genre=') || sourceUrl.includes('/chapter/')) return;

            seenUrls.add(sourceUrl);

            // Prioritize h3 for title (actual series title)
            // On browse page, ratings are also in spans inside the first <a> tag
            let title = a.find('h3').text().trim() ||
                a.find('span.font-bold').filter((_, s) => !this.isRating($(s).text())).text().trim() ||
                a.find('span.text-white').filter((_, s) => !this.isRating($(s).text())).text().trim();

            // If the <a> tag was the cover image, find the title link nearby
            if (!title || this.isRating(title)) {
                const card = a.closest('.series-card, div');
                title = card.find('h3').text().trim();
            }

            if (this.isNoise(title) || this.isRating(title)) {
                // Try harder
                a.find('span').each((_, s) => {
                    const t = $(s).text().trim();
                    if (t && !this.isRating(t) && !this.isNoise(t) && t.length > 2) {
                        title = t;
                        return false;
                    }
                });
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
            if (this.isNoise(title) || sourceUrl.includes('recruitment') || sourceUrl.includes('beta-site')) return;

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

    private isNoise(t: string): boolean {
        return this.isNoiseTitle(t);
    }

    private isRating(s: string): boolean {
        return /^\d+(\.\d+)?$/.test(s.trim());
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

        const isNoise = (t: string) => this.isNoiseTitle(t) || t.toUpperCase() === 'ASURA SCANS';

        // Multi-layered Title extraction
        // 1. Meta tags (most reliable)
        let title = $('meta[property="og:title"]').attr('content') ||
            $('meta[property="twitter:title"]').attr('content') ||
            $('meta[name="title"]').attr('content') ||
            $('title').text();

        if (title) {
            // Split by common separators and find the first part that isn't noise
            const parts = title.split(/ - | \| | – |—/).map(p => p.trim());
            
            // Specifically reject the site name
            const bestPart = parts.find(p => !isNoise(p) && p.toLowerCase() !== 'asura scans' && p.toLowerCase() !== 'asuratoon');
            
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
        // 1. Try the rounded-xl container img (new Asura layout)
        $('div.rounded-xl img.object-cover').each((_, el) => {
            const src = $(el).attr('src');
            if (src && !src.includes('banner') && !src.includes('logo') && !src.includes('favicon')) {
                coverUrl = src;
                return false;
            }
        });
        // 2. Fallback: img[alt="poster"]
        if (!coverUrl) {
            $('img[alt="poster"]').each((_, el) => {
                const src = $(el).attr('src');
                if (src && !src.includes('banner') && !src.includes('logo')) {
                    coverUrl = src;
                    return false;
                }
            });
        }
        // 3. Fallback: any img with 'covers' in src path (CDN pattern)
        if (!coverUrl) {
            $('img[src*="covers"]').each((_, el) => {
                const src = $(el).attr('src');
                if (src) {
                    coverUrl = src;
                    return false;
                }
            });
        }
        // 4. Fallback: og:image meta tag
        if (!coverUrl) {
            coverUrl = $('meta[property="og:image"]').attr('content') || '';
        }

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
            // Try og:description and meta description (most reliable on new Asura layout)
            summary = $('meta[property="og:description"]').attr('content')?.trim() || '';
        }
        if (!summary || summary.toLowerCase().includes('read manga') || summary.toLowerCase().includes('online for free')) {
            summary = $('meta[name="description"]').attr('content')?.trim() || '';
        }
        
        // Final sanity check for generic SEO descriptions
        if (summary.toLowerCase().includes('read manga') || summary.toLowerCase().includes('online for free')) {
            summary = 'No synopsis available.';
        }

        let chapters: { title: string; url: string; date?: string }[] = [];

        // --- NEW ASTRO DATA EXTRACTION ---
        // Asura now uses Astro, which stores the full chapter list in <astro-island> props
        let astroChaptersFound = false;
        $('astro-island[component-url*="ChapterList"]').each((_, el) => {
            const propsStr = $(el).attr('props');
            if (propsStr) {
                try {
                    const props = JSON.parse(propsStr);
                    // Astro serializes arrays weirdly: [1, [[0, {"id":[0,123], "number":[0,50], ...}]]]
                    
                    const extractAstroChapters = (obj: any) => {
                        if (!obj) return;
                        if (Array.isArray(obj)) {
                            obj.forEach(extractAstroChapters);
                        } else if (typeof obj === 'object') {
                            // Astro encodes scalar values as [0, value]
                            const getAstroVal = (val: any) => Array.isArray(val) ? val[1] : val;
                            
                            const slugVal = getAstroVal(obj.slug);
                            const titleVal = getAstroVal(obj.title);
                            const numVal = getAstroVal(obj.number);
                            const timeVal = getAstroVal(obj.time_ago);
                            
                            // If this object represents a chapter (must have slug, and either a title OR a number)
                            if (slugVal && typeof slugVal === 'string' && (titleVal || numVal !== undefined)) {
                                const chapterUrl = `${BASE_URL}/comics/${url.split('/comics/')[1]?.split('/')[0] || 'series'}/chapter/${slugVal.replace('chapter-', '')}`;
                                
                                let chapTitle = titleVal ? String(titleVal) : `Chapter ${numVal}`;
                                if (numVal && titleVal) chapTitle = `Chapter ${numVal}: ${titleVal}`;
                                
                                if (!chapters.some(c => c.url === chapterUrl)) {
                                    chapters.push({
                                        title: chapTitle,
                                        url: chapterUrl,
                                        date: timeVal ? String(timeVal) : undefined
                                    });
                                }
                                astroChaptersFound = true;
                            } else {
                                // Keep digging deeply
                                Object.values(obj).forEach(extractAstroChapters);
                            }
                        }
                    };

                    extractAstroChapters(props);
                } catch (e) {
                    console.error("[Asura Scraper] Failed to parse Astro props:", e);
                }
            }
        });

        // --- DOM FALLBACK (If Astro extraction failed) ---
        if (!astroChaptersFound || chapters.length === 0) {
        // Chapter list container - try multiple selectors
        // New: div with max-h-[500px] and overflow-y-auto, or a.group links
        const chapterContainerSelectors = [
            'div[class*="max-h"] a[href*="/chapter/"]',        // New: max-h container
            'div.overflow-y-auto a[href*="/chapter/"]',         // Legacy
            'div[class*="overflow-y"] a[href*="/chapter/"]',    // Broader
            'a.group[href*="/chapter/"]',                        // New: a.group chapter links
        ];

        let chapterLinks: any[] = [];
        for (const sel of chapterContainerSelectors) {
            const found = $(sel);
            if (found.length > 0) {
                chapterLinks = found.toArray();
                break;
            }
        }

        // Fallback: get ALL chapter links if none found via specific selectors
        if (chapterLinks.length === 0) {
            chapterLinks = $('a[href*="/chapter/"]').toArray();
        }

        chapterLinks.forEach((el) => {
            const link = $(el).attr('href');
            // Try span.font-medium first (new layout), then h3, then all spans
            const fontMediumSpans = $(el).find('span.font-medium');
            const h3s = $(el).find('h3');
            const spans = $(el).find('span');

            // Helper to clean React hydration markers (<!-- -->)
            const cleanText = (t: string) => t.replace(/<!--\s*-->/g, '').replace(/\s+/g, ' ').trim();

            let texts: string[] = [];
            if (fontMediumSpans.length > 0) {
                texts = fontMediumSpans.map((_: number, s: any) => cleanText($(s).text()).replace('MANHWA', '')).get().filter(Boolean);
                // Also grab subtitle spans (not font-medium)
                const otherSpans = $(el).find('span:not(.font-medium)');
                if (otherSpans.length > 0) {
                    otherSpans.each((_: number, s: any) => {
                        const t = cleanText($(s).text()).replace('MANHWA', '');
                        if (t && !texts.includes(t)) texts.push(t);
                    });
                }
            } else if (h3s.length > 0) {
                texts = h3s.map((_: number, h: any) => cleanText($(h).text()).replace('MANHWA', '')).get().filter(Boolean);
            } else if (spans.length > 0) {
                texts = spans.map((_: number, s: any) => cleanText($(s).text()).replace('MANHWA', '')).get().filter(Boolean);
            } else {
                // Use direct text
                const directText = cleanText($(el).text());
                if (directText) texts = [directText];
            }

            if (texts.length > 0) {
                let chapTitle = texts[0] || 'Unknown Chapter';
                let subLabel = texts.length > 1 ? texts[1] : '';
                let dateLabel = texts.length > 2 ? texts[2] : '';

                // 1. Aggressive Clean for "First Chapter" and "New Chapter"
                if (chapTitle.match(/^(First|New)\s*Chapter/i)) {
                    const cleaned = chapTitle.replace(/^(First|New)\s*Chapter/i, '').trim();
                    if (cleaned.toLowerCase().startsWith('chapter') || cleaned.match(/^\d/)) {
                        chapTitle = cleaned;
                    } else if (subLabel && subLabel.toLowerCase().includes('chapter')) {
                        chapTitle = subLabel;
                        subLabel = '';
                    }
                    chapTitle = chapTitle.replace(/ChapterChapter/i, 'Chapter');
                }

                // 2. Identify Date
                const isDateText = (text: string) => {
                    const t = text.toLowerCase();
                    return t.includes('ago') || t.includes('last week') || t.includes('yesterday') || t.includes('today') || t.match(/^[A-Za-z]+ \d+/) || t.match(/^\d+/);
                };

                if (subLabel && !dateLabel && isDateText(subLabel)) {
                    dateLabel = subLabel;
                    subLabel = '';
                }

                // 3. Merge Intelligent
                if (subLabel) {
                    if (subLabel.toLowerCase().includes('chapter') && !chapTitle.toLowerCase().includes('chapter')) {
                        chapTitle = `${subLabel}: ${chapTitle}`;
                    } else if (!chapTitle.includes(subLabel)) {
                        chapTitle = `${chapTitle} ${subLabel}`;
                    }
                }

                if (link) {
                    const chapterUrl = link.startsWith('http') ? link : `${BASE_URL}${link.startsWith('/') ? '' : '/'}${link}`;
                    chapTitle = chapTitle.replace(/\s+/g, ' ').trim();

                    // Deduplicate
                    if (!chapters.some(c => c.url === chapterUrl)) {
                        chapters.push({
                            title: chapTitle,
                            url: chapterUrl,
                            date: dateLabel
                        });
                    }
                }
            }
        });

        }

        // Reverse to ensure Oldest -> Newest (Asura DOM gives Newest -> Oldest)
        chapters.reverse();

        // Robust Numeric Sort as a safety net after reversing
        // Extracts the chapter number from the title (e.g., "Chapter 42" -> 42)
        const hasNumbers = chapters.some(c => /\d+/.test(c.title));
        if (hasNumbers) {
            chapters.sort((a, b) => {
                const getNum = (t: string): number => {
                    const match = t.match(/(?:chapter|ch\.?)\s*(\d+(?:\.\d+)?)/i) || t.match(/(\d+(?:\.\d+)?)/);
                    return match ? parseFloat(match[1]) : 0;
                };
                return getNum(a.title) - getNum(b.title);
            });
        }

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

    /**
     * Extract the page number from an image filename for sorting.
     * Handles patterns like: 01.webp, page_02.jpg, image-003.png
     * AND Asura's new ULID patterns: 01K99EBHMABQEN2E3Q5FZ4D29E (Lexicographically sortable - effectively numeric)
     */

    /**
     * Check if an image is likely a chapter page (content) or an ad/extra.
     * Content pages usually have simple numeric filenames like "01.webp".
     * Ads usually have huge random UUIDs (though Asura now uses ULIDs for content too).
     */
    private isContentPage(url: string): boolean {
        // Explicitly exclude GIFs
        if (url.toLowerCase().includes('.gif')) return false;

        const filename = url.split('/').pop() || '';
        const nameWithoutExt = filename.replace(/\.(jpg|jpeg|png|webp|avif|gif)$/i, '');
        const cleanName = nameWithoutExt.replace(/-optimized|_optimized/i, '');
        const lowerName = cleanName.toLowerCase();

        // **Strict Blacklist for Ads/Promos**
        const blacklist = ['logo', 'banner', 'discord', 'promo', 'ad-', '_ad', 'patreon', 'ko-fi', 'credit', 'recruit', 'intro', 'outro'];
        if (blacklist.some(term => lowerName.includes(term))) return false;

        // Pattern 1: Purely numeric
        if (/^\d+$/.test(cleanName)) return true;

        // Pattern 2: Prefix + number (Restrictive)
        // Only allow 'page', 'img', 'image', 'p', 'i' or strict alphanumeric codes
        if (/^(page|img|image|p|i)?[-_]?\d+$/i.test(cleanName)) return true;

        // Pattern 3: ULID (Asura's new format) -> 26 chars, starts with 0-7
        if (/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(cleanName)) return true;

        return false;
    }

    /**
     * Sort image URLs: EXTRACT ONLY CONTENT IMAGES.
     * Filters out ads/extras (long UUIDs, GIFs).
     */
    /**
     * Filter image URLs: EXTRACT ONLY CONTENT IMAGES.
     * Filters out ads/extras (long UUIDs, GIFs).
     * DOES NOT SORT. Trusts source order.
     */
    private filterImages(images: string[]): string[] {
        const contentPages: string[] = [];
        const seen = new Set<string>();

        images.forEach(img => {
            if (!img) return;
            // Strict filtering: Only keep images identified as content
            if (this.isContentPage(img)) {
                if (!seen.has(img)) {
                    contentPages.push(img);
                    seen.add(img);
                }
            }
        });

        return contentPages;
    }

    async fetchChapterImages(url: string): Promise<string[]> {
        const html = await this.fetchHtml(url);
        if (!html) return [];

        const $ = cheerio.load(html);
        const uniqueImages = new Set<string>();

        // Strategy 1: Parse Astro Island Reader Props (Modern Asura)
        try {
            let readerPropsRaw = '';
            $('astro-island').each((_, el) => {
                const compUrl = $(el).attr('component-url') || '';
                if (compUrl.includes('Reader')) {
                    readerPropsRaw = $(el).attr('props') || '';
                }
            });

            if (readerPropsRaw) {
                const parsed = JSON.parse(readerPropsRaw);
                
                // Deep search for any object that looks like: { url: [0, "https://cdn.asurascans..."] } or { url: "https..." }
                const extractAstroUrls = (obj: any) => {
                    if (!obj) return;
                    if (Array.isArray(obj)) {
                        obj.forEach(extractAstroUrls);
                    } else if (typeof obj === 'object') {
                        const getAstroVal = (val: any) => Array.isArray(val) ? val[1] : val;
                        const urlVal = getAstroVal(obj.url) || getAstroVal(obj.src);
                        
                        if (urlVal && typeof urlVal === 'string' && urlVal.startsWith('http')) {
                            if (!urlVal.includes('logo') && !urlVal.includes('icon') && !urlVal.includes('avatar')) {
                                uniqueImages.add(urlVal);
                            }
                        } else {
                            Object.values(obj).forEach(extractAstroUrls);
                        }
                    }
                };

                extractAstroUrls(parsed);
                
                if (uniqueImages.size > 0) {
                    return this.filterImages(Array.from(uniqueImages));
                }
            }
        } catch (e) {
            console.error('[Asura] Error parsing Astro Reader props:', e);
        }

        // Strategy 2: Regex extraction (Fallback)
        console.log('[Asura] Using regex fallback for image extraction');
        // Decode HTML entities just in case URLs are hidden inside attributes
        const decodedHtml = html.replace(/&quot;/g, '"').replace(/\\"/g, '"').replace(/\\\//g, '/');
        const urlRegex = /https?:\/\/[^"'\s\\]+\.(?:jpg|jpeg|png|webp|avif)/gi;
        const matches = decodedHtml.match(urlRegex) || [];

        matches.forEach(imageUrl => {
            if ((imageUrl.includes('gg.asuracomic') || imageUrl.includes('cdn.asurascans') || imageUrl.includes('asura')) &&
                !imageUrl.includes('logo') &&
                !imageUrl.includes('icon') &&
                !imageUrl.includes('thumb') &&
                !imageUrl.includes('avatar') &&
                !imageUrl.includes('cover')) {
                uniqueImages.add(imageUrl);
            }
        });

        return this.filterImages(Array.from(uniqueImages));
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
                        'Referer': 'https://asurascans.com/',
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
                // Web: Cloudflare blocks the Vite dev proxy, so use external CORS proxies first
                const webProxies = [
                    { name: 'corsproxy.io', url: `https://corsproxy.io/?${encodeURIComponent(url)}` },
                    { name: 'codetabs', url: `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}` },
                    { name: 'local', url: `/api/proxy?url=${encodeURIComponent(url)}` },
                ];

                for (const proxy of webProxies) {
                    try {
                        const response = await fetch(proxy.url, {
                            headers: {
                                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                                'Accept-Language': 'en-US,en;q=0.9',
                            }
                        });
                        if (!response.ok) {
                            console.warn(`[Asura] ${proxy.name} returned HTTP ${response.status}`);
                            continue;
                        }
                        const html = await response.text();
                        if (this.isValidHtml(html)) {
                            console.log(`[Asura] ✓ Got valid HTML (${html.length} chars) via ${proxy.name}`);
                            return html;
                        }
                        console.warn(`[Asura] ${proxy.name} returned Cloudflare challenge, trying next...`);
                    } catch (e) {
                        console.warn(`[Asura] ${proxy.name} error:`, e);
                    }
                }
                console.error('[Asura] All web proxies failed');
                return '';
            }
        } catch (error) {
            console.error('Asura Scrape Error:', error);
            return '';
        }
    }
}

export const asuraScraperService = new AsuraScraperService();
