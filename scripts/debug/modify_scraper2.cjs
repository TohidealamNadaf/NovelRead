const fs = require('fs');
const path = require('path');

const file = 'd:/NovelReadingApp/src/services/scraper.service.ts';
let code = fs.readFileSync(file, 'utf-8');

// We need to branch extractMetadata in _fetchNovelFastInternal and fetchNovel.
// Let's replace the extractMetadata block in fetchNovelFast.
const fastNovelMatcher = /\/\/ NovelFire detail page selectors:[\s\S]*?workingProxy = proxyUrl;\n\s+break;\n\s+\}/;

const fastNovelReplacement = `// Parse based on URL
                if (url.includes('freewebnovel.com')) {
                    const extractedTitle = $('h1.tit').text().trim();
                    if (extractedTitle) {
                        title = extractedTitle;
                        author = 'Unknown'; // FWN doesn't show author easily
                        const extractedSummary = $('.inner').text().trim();
                        summary = this.cleanSummary(extractedSummary);
                        status = 'Ongoing';
                        
                        let extractedCover = $('.pic img').first().attr('src') || '';
                        if (extractedCover && !extractedCover.startsWith('http')) {
                            if (!extractedCover.startsWith('/')) extractedCover = '/' + extractedCover;
                            extractedCover = \`https://freewebnovel.com\${extractedCover}\`;
                        }
                        coverUrl = extractedCover;

                        onProgress?.([], 0, { title, author, summary, status, coverUrl });
                        listUrl = infoUrl; // Chapters are on the same page
                        workingProxy = proxyUrl;
                        break;
                    }
                } else {
                    // NovelFire detail page selectors:
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
                            else {
                                if (!extractedCover.startsWith('/')) extractedCover = '/' + extractedCover;
                                extractedCover = \`https://novelfire.net\${extractedCover}\`;
                            }
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

code = code.replace(fastNovelMatcher, fastNovelReplacement);


const novelMatcher = /const extractMetadata = \(\$: cheerio\.CheerioAPI\) => \{[\s\S]*?return \{\n\s+title: extractedTitle,[\s\S]*?\};\n\s+\};/;
const novelReplacement = `const extractMetadata = ($: cheerio.CheerioAPI) => {
            if (url.includes('freewebnovel.com')) {
                const extractedTitle = $('h1.tit').text().trim();
                let extractedCover = $('.pic img').first().attr('src') || '';
                if (extractedCover && !extractedCover.startsWith('http')) {
                    if (!extractedCover.startsWith('/')) extractedCover = '/' + extractedCover;
                    extractedCover = \`https://freewebnovel.com\${extractedCover}\`;
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
                const origin = 'https://novelfire.net';
                if (extractedCover.startsWith('//')) {
                    extractedCover = \`https:\${extractedCover}\`;
                } else {
                    if (!extractedCover.startsWith('/')) extractedCover = '/' + extractedCover;
                    extractedCover = \`\${origin}\${extractedCover}\`;
                }
            }

            return {
                title: extractedTitle,
                author: extractedAuthor,
                coverUrl: extractedCover,
                summary: cleanedSummary,
                status: extractedStatus
            };
        };`;
        
code = code.replace(novelMatcher, novelReplacement);

// Also we need to adjust listUrl in fetchNovel
const fetchNovelListUrlMatcher = /if \(!userProvidedChapters\) \{\n\s+const chaptersLink = \$\('a\[href\*\="\/chapters"\]'\).first\(\).attr\('href'\);[\s\S]*?\}\n\s+break;\n\s+\}/;
const fetchNovelListUrlReplacement = `if (url.includes('freewebnovel.com')) {
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

code = code.replace(fetchNovelListUrlMatcher, fetchNovelListUrlReplacement);

// Add FreeWebNovel specific chapter selector to extractChaptersFromPage
// '.m-newest2 ul li a' -> FreeWebNovel
const chapterSelectorsMatcher = /'ul\.list-chapter li', '#chapter-list li', '\.chapters li',/;
const chapterSelectorsReplacement = `'ul.list-chapter li', '#chapter-list li', '.chapters li', '.m-newest2 ul li',`;

code = code.replace(chapterSelectorsMatcher, chapterSelectorsReplacement);

fs.writeFileSync(file, code);
console.log('Modified ' + file);
