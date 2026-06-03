const fs = require('fs');
const file = 'd:/NovelReadingApp/src/services/scraper.service.ts';
let code = fs.readFileSync(file, 'utf-8');

// Update _fetchNovelFastInternal
const fastNovelMatcher = code.indexOf('const html = await this.fetchHtml(infoUrl, proxyUrl);');
if (fastNovelMatcher !== -1) {
    const fastNovelIndex2 = code.indexOf('const $ = cheerio.load(html);', fastNovelMatcher);
    const fastNovelIndex3 = code.indexOf('if (extractedTitle) {', fastNovelIndex2);
    // Replace the metadata extraction block
    const extractionStart = code.indexOf('const extractedTitle = (', fastNovelIndex2);
    const extractionEnd = code.indexOf('workingProxy = proxyUrl;\n                    break;\n                }', fastNovelIndex3) + 'workingProxy = proxyUrl;\n                    break;\n                }'.length;
    
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

// Update fetchNovel
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

// Update listUrl in fetchNovel
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

fs.writeFileSync(file, code);
console.log('Successfully injected code!');
