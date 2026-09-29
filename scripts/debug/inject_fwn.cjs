const fs = require('fs');
const file = 'd:/NovelReadingApp/src/services/scraper.service.ts';
let code = fs.readFileSync(file, 'utf-8');

// 1. Inject parseFreeWebNovelsList and syncFreeWebNovelDiscoverData just before syncAllDiscoverData
const inject1 = `
    private parseFreeWebNovelsList($: cheerio.CheerioAPI, selector: string): (NovelMetadata & { sourceUrl: string })[] {
        const novels: (NovelMetadata & { sourceUrl: string })[] = [];
        const origin = 'https://freewebnovel.com';

        $(selector).each((_, el) => {
            const $el = $(el);
            const titleEl = $el.find('.tit a').first();
            let title = titleEl.attr('title') || titleEl.text().trim();
            if (!title) return;

            let url = titleEl.attr('href') || '';
            if (url && !url.startsWith('http')) {
                if (!url.startsWith('/')) url = '/' + url;
                url = \`\${origin}\${url}\`;
            }

            let coverUrl = $el.find('.pic img').first().attr('src') || '';
            if (coverUrl && !coverUrl.startsWith('http')) {
                if (!coverUrl.startsWith('/')) coverUrl = '/' + coverUrl;
                coverUrl = \`\${origin}\${coverUrl}\`;
            }

            const status = 'Ongoing'; 

            if (url) {
                novels.push({
                    title,
                    author: 'Unknown',
                    coverUrl,
                    summary: '',
                    status,
                    sourceUrl: url,
                    chapters: []
                });
            }
        });

        const seen = new Set<string>();
        return novels.filter(n => {
            if (seen.has(n.sourceUrl)) return false;
            seen.add(n.sourceUrl);
            return true;
        });
    }

    async syncFreeWebNovelDiscoverData(onProgress?: (task: string, current: number, total: number) => void): Promise<HomeData> {
        const results: HomeData = { recommended: [], ranking: [], latest: [], recentlyAdded: [], completed: [] };
        
        const fetchList = async (url: string) => {
            for (const proxyUrl of this.getProxies()) {
                const html = await this.fetchHtml(url, proxyUrl);
                if (html) {
                    const $ = cheerio.load(html);
                    return this.parseFreeWebNovelsList($, 'div.li');
                }
            }
            return [];
        };

        try {
            onProgress?.('Syncing Top Rankings...', 1, 4);
            results.ranking = await fetchList('https://freewebnovel.com/sort/most-popular');

            onProgress?.('Syncing Latest Updates...', 2, 4);
            results.latest = await fetchList('https://freewebnovel.com/sort/latest-release');

            onProgress?.('Syncing Completed Stories...', 3, 4);
            results.completed = await fetchList('https://freewebnovel.com/sort/completed-novel');

            onProgress?.('Syncing Recently Added...', 4, 4);
            results.recentlyAdded = await fetchList('https://freewebnovel.com/sort/latest-novel');

            onProgress?.('Generating Recommendations...', 5, 5);
            results.recommended = [...results.ranking].sort(() => 0.5 - Math.random()).slice(0, 10);
            
            const dedupe = (arr: NovelMetadata[]) => {
                const seen = new Set();
                return arr.filter(item => {
                    if (!item.title) return false;
                    const k = item.title.toLowerCase();
                    if (seen.has(k)) return false;
                    seen.add(k);
                    return true;
                });
            };
            results.ranking = dedupe(results.ranking);
            results.latest = dedupe(results.latest);
            results.completed = dedupe(results.completed);
            results.recentlyAdded = dedupe(results.recentlyAdded);
        } catch (e) {
            console.error('[Scraper] FreeWebNovel sync failed', e);
        }
        return results;
    }

    async syncAllDiscoverData`;

code = code.replace('async syncAllDiscoverData', inject1);

// 2. Modify searchNovels
const searchIndex = code.indexOf('async searchNovels(query: string): Promise<NovelMetadata[]> {');
if (searchIndex !== -1) {
    const searchReplace = `async searchNovels(query: string, source: 'novelfire' | 'freewebnovel' = 'novelfire'): Promise<NovelMetadata[]> {
        if (source === 'freewebnovel') {
            const url = \`https://freewebnovel.com/search?searchkey=\${encodeURIComponent(query)}\`;
            for (const proxyUrl of this.getProxies()) {
                try {
                    const html = await this.fetchHtml(url, proxyUrl);
                    if (!html) continue;
                    const $ = cheerio.load(html);
                    const novels = this.parseFreeWebNovelsList($, 'div.li');
                    if (novels.length > 0) return novels;
                } catch (e) {
                    console.error(\`[Scraper] FreeWebNovel Search failed\`, e);
                }
            }
            return [];
        }`;
    code = code.slice(0, searchIndex) + searchReplace + code.slice(searchIndex + 'async searchNovels(query: string): Promise<NovelMetadata[]> {'.length);
}

// 3. Modify syncAllDiscoverData signature
const syncIndex = code.indexOf('async syncAllDiscoverData(onProgress?: (task: string, current: number, total: number) => void): Promise<HomeData> {');
if (syncIndex !== -1) {
    const syncReplace = `async syncAllDiscoverData(onProgress?: (task: string, current: number, total: number) => void, source: 'novelfire' | 'freewebnovel' = 'novelfire'): Promise<HomeData> {
        if (source === 'freewebnovel') return this.syncFreeWebNovelDiscoverData(onProgress);`;
    code = code.slice(0, syncIndex) + syncReplace + code.slice(syncIndex + 'async syncAllDiscoverData(onProgress?: (task: string, current: number, total: number) => void): Promise<HomeData> {'.length);
}

// 4. Update fetchChapterContent selectors for FreeWebNovel
const chapterSelectorsIndex = code.indexOf("'#content',              // NovelFire: <div id=\"content\" class=\"clearfix font_default\">");
if (chapterSelectorsIndex !== -1) {
    const chapterSelectorsReplace = `'#content',              // NovelFire: <div id="content" class="clearfix font_default">
                    '.txt',                  // FreeWebNovel: <div class="txt">`;
    code = code.slice(0, chapterSelectorsIndex) + chapterSelectorsReplace + code.slice(chapterSelectorsIndex + "'#content',              // NovelFire: <div id=\"content\" class=\"clearfix font_default\">".length);
}

// 5. Update _fetchNovelFastInternal
const fastNovelMatcher = code.indexOf('const html = await this.fetchHtml(infoUrl, proxyUrl);');
if (fastNovelMatcher !== -1) {
    const fastNovelIndex2 = code.indexOf('const $ = cheerio.load(html);', fastNovelMatcher);
    const fastNovelIndex3 = code.indexOf('if (extractedTitle) {', fastNovelIndex2);
    // Replace the metadata extraction block
    const extractionStart = code.indexOf('const extractedTitle = (', fastNovelIndex2);
    const extractionEnd = code.indexOf('workingProxy = proxyUrl;\n                    break;\n                }\n            } catch', fastNovelIndex3) + 'workingProxy = proxyUrl;\n                    break;\n                }'.length;
    
    if (extractionStart !== -1 && extractionEnd !== -1) {
        const replacement = `if (url.includes('freewebnovel.com')) {
                    const extractedTitle = $('h1.tit').text().trim();
                    if (extractedTitle) {
                        title = extractedTitle;
                        author = 'Unknown';
                        summary = this.cleanSummary($('.inner').text().trim());
                        status = 'Ongoing';
                        let extractedCover = $('.pic img').first().attr('src') || '';
                        if (extractedCover && !extractedCover.startsWith('http')) {
                            extractedCover = \`https://freewebnovel.com\${extractedCover.startsWith('/') ? '' : '/'}\${extractedCover}\`;
                        }
                        coverUrl = extractedCover;

                        onProgress?.([], 0, { title, author, summary, status, coverUrl });
                        listUrl = infoUrl; // Chapters are on the same page
                        workingProxy = proxyUrl;
                        break;
                    }
                } else {
                    const extractedTitle = (
                        $('h1[itemprop="name"]').text().trim() ||
                        $('h1.novel-title').text().trim() ||
                        $('h1').first().text().trim() ||
                        $('meta[property="og:title"]').attr('content') || ''
                    ).split(' Novel - Read')[0].split(' - Novel Fire')[0].trim();

                    if (extractedTitle) {
                        title = extractedTitle;

                        author = (
                            $('span[itemprop="author"]').first().text().trim() ||
                            $('.author a').first().text().trim() ||
                            $('.author').text().replace('Author:', '').trim() ||
                            'Unknown'
                        );

                        let extractedSummary = (
                            $('.summary .content').text().trim() ||
                            $('.summary').text().replace(/^Summary\\s*/i, '').trim() ||
                            $('.summary__content').text().trim() ||
                            $('.description').text().trim() ||
                            $('#editdescription').text().trim() ||
                            $('.book-info-desc').text().trim() ||
                            $('.content').first().text().trim()
                        );
                        if (!extractedSummary) {
                            const metaDesc = $('meta[name="description"]').attr('content') || '';
                            if (!metaDesc.toLowerCase().includes('novel online free')) {
                                extractedSummary = metaDesc;
                            }
                        }
                        summary = this.cleanSummary(extractedSummary);

                        status = (
                            $('strong.ongoing').first().text().trim() ||
                            $('strong.status').first().text().trim() ||
                            $('.header-stats strong').last().text().trim() ||
                            'Ongoing'
                        );

                        let extractedCover = $('meta[property="og:image"]').attr('content') || '';
                        if (!extractedCover) {
                            const imgEl = $('figure.novel-cover img, .novel-cover img, .cover img, .book-cover img').first();
                            extractedCover = imgEl.attr('src') || imgEl.attr('data-src') || imgEl.attr('data-lazy-src') || '';
                        }
                        if (extractedCover && !extractedCover.startsWith('http')) {
                            if (extractedCover.startsWith('//')) extractedCover = \`https:\${extractedCover}\`;
                            else extractedCover = \`https://novelfire.net\${extractedCover.startsWith('/') ? '' : '/'}\${extractedCover}\`;
                        }
                        coverUrl = extractedCover;

                        onProgress?.([], 0, { title, author, summary, status, coverUrl });

                        if (!userProvidedChapters) {
                            const chaptersLink = $('a[href*="/chapters"]').first().attr('href');
                            if (chaptersLink) {
                                const origin = new URL(infoUrl).origin;
                                listUrl = chaptersLink.startsWith('http') ? chaptersLink : \`\${origin}\${chaptersLink.startsWith('/') ? '' : '/'}\${chaptersLink}\`;
                            } else {
                                listUrl = infoUrl.replace(/\\/$/, '') + '/chapters';
                            }
                        }

                        workingProxy = proxyUrl;
                        break;
                    }
                }`;
        code = code.slice(0, extractionStart) + replacement + code.slice(extractionEnd);
    }
}

// 6. Update fetchNovel
const fetchNovelIndex = code.indexOf('const extractMetadata = ($: cheerio.CheerioAPI) => {');
if (fetchNovelIndex !== -1) {
    const fetchNovelEnd = code.indexOf('return {\n                title: extractedTitle,', fetchNovelIndex);
    const fetchNovelEndFull = code.indexOf('};\n        };', fetchNovelEnd) + '};\n        };'.length;
    
    if (fetchNovelEnd !== -1) {
        const replacement = `const extractMetadata = ($: cheerio.CheerioAPI) => {
            if (url.includes('freewebnovel.com')) {
                const extractedTitle = $('h1.tit').text().trim();
                let extractedCover = $('.pic img').first().attr('src') || '';
                if (extractedCover && !extractedCover.startsWith('http')) {
                    extractedCover = \`https://freewebnovel.com\${extractedCover.startsWith('/') ? '' : '/'}\${extractedCover}\`;
                }
                return {
                    title: extractedTitle,
                    author: 'Unknown',
                    coverUrl: extractedCover,
                    summary: this.cleanSummary($('.inner').text().trim()),
                    status: 'Ongoing'
                };
            }

            const extractedTitle = (
                $('h1[itemprop="name"]').text().trim() ||
                $('h1.novel-title').text().trim() ||
                $('h1').first().text().trim() ||
                $('meta[property="og:title"]').attr('content') || ''
            ).split(' Novel - Read')[0].split(' - Novel Fire')[0].trim();

            const extractedAuthor = (
                $('span[itemprop="author"]').first().text().trim() ||
                $('.author a').first().text().trim() ||
                $('.author').text().replace('Author:', '').trim() ||
                'Unknown'
            );

            let extractedSummary = (
                $('.summary .content').text().trim() ||
                $('.summary').text().replace(/^Summary\\s*/i, '').trim() ||
                $('.summary__content').text().trim() ||
                $('.description').text().trim() ||
                $('#editdescription').text().trim() ||
                $('.book-info-desc').text().trim() ||
                $('.content').first().text().trim()
            );

            if (!extractedSummary) {
                const metaDesc = $('meta[name="description"]').attr('content') || '';
                if (!metaDesc.toLowerCase().includes('novel online free')) {
                    extractedSummary = metaDesc;
                }
            }
            const cleanedSummary = this.cleanSummary(extractedSummary);

            const extractedStatus = (
                $('strong.ongoing').first().text().trim() ||
                $('strong.status').first().text().trim() ||
                $('.header-stats strong').last().text().trim() ||
                'Ongoing'
            );

            let extractedCover = $('meta[property="og:image"]').attr('content') || '';
            if (!extractedCover) {
                const imgEl = $('figure.novel-cover img, .novel-cover img, .cover img, .book-cover img').first();
                extractedCover = imgEl.attr('src') || imgEl.attr('data-src') || imgEl.attr('data-lazy-src') || '';
            }

            if (extractedCover && !extractedCover.startsWith('http')) {
                if (extractedCover.startsWith('//')) extractedCover = \`https:\${extractedCover}\`;
                else extractedCover = \`https://novelfire.net\${extractedCover.startsWith('/') ? '' : '/'}\${extractedCover}\`;
            }

            return {
                title: extractedTitle,
                author: extractedAuthor,
                coverUrl: extractedCover,
                summary: cleanedSummary,
                status: extractedStatus
            };
        };`;
        code = code.slice(0, fetchNovelIndex) + replacement + code.slice(fetchNovelEndFull);
    }
}

// 7. Update listUrl in fetchNovel
const listUrlIndex = code.indexOf('if (!userProvidedChapters) {\n                        const chaptersLink = $(\'a[href*="/chapters"]\').first().attr(\'href\');');
if (listUrlIndex !== -1) {
    const listUrlEnd = code.indexOf('break;\n                }', listUrlIndex) + 'break;\n                }'.length;
    const replacement = `if (url.includes('freewebnovel.com')) {
                        listUrl = infoUrl;
                    } else if (!userProvidedChapters) {
                        const chaptersLink = $('a[href*="/chapters"]').first().attr('href');
                        if (chaptersLink) {
                            const origin = new URL(infoUrl).origin;
                            listUrl = chaptersLink.startsWith('http') ? chaptersLink : \`\${origin}\${chaptersLink.startsWith('/') ? '' : '/'}\${chaptersLink}\`;
                        } else {
                            listUrl = infoUrl.replace(/\\/$/, '') + '/chapters';
                        }
                    }
                    break;
                }`;
    code = code.slice(0, listUrlIndex) + replacement + code.slice(listUrlEnd);
}

// 8. Update chapter generic selectors for FreeWebNovel
const chapterSelectors = code.indexOf("'ul.list-chapter li', '#chapter-list li', '.chapters li',");
if (chapterSelectors !== -1) {
    const replacement = `'ul.list-chapter li', '#chapter-list li', '.chapters li', '.m-newest2 ul li',`;
    code = code.slice(0, chapterSelectors) + replacement + code.slice(chapterSelectors + "'ul.list-chapter li', '#chapter-list li', '.chapters li',".length);
}


fs.writeFileSync(file, code);
console.log('Successfully injected code!');
