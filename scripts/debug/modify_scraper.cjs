const fs = require('fs');
const path = require('path');

const file = 'd:/NovelReadingApp/src/services/scraper.service.ts';
let code = fs.readFileSync(file, 'utf-8');

// 1. Add parseFreeWebNovelsList and syncFreeWebNovelDiscoverData
const newMethods = `
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
`;

code = code.replace(/async searchNovels/, newMethods + '\n    async searchNovels');

// 2. Modify searchNovels
code = code.replace(
    /async searchNovels\(query: string\): Promise<NovelMetadata\[\]> \{/,
    `async searchNovels(query: string, source: 'novelfire' | 'freewebnovel' = 'novelfire'): Promise<NovelMetadata[]> {
        if (source === 'freewebnovel') {
            const url = \`https://freewebnovel.com/search?searchkey=\${encodeURIComponent(query)}\`;
            console.log(\`[Scraper] Searching FreeWebNovel: \${url}\`);
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
        }`
);

// 3. Modify syncAllDiscoverData
code = code.replace(
    /async syncAllDiscoverData\(onProgress\?: \(task: string, current: number, total: number\) => void\): Promise<HomeData> \{/,
    `async syncAllDiscoverData(onProgress?: (task: string, current: number, total: number) => void, source: 'novelfire' | 'freewebnovel' = 'novelfire'): Promise<HomeData> {
        if (source === 'freewebnovel') {
            return this.syncFreeWebNovelDiscoverData(onProgress);
        }`
);

// 4. Update fetchChapterContent selectors for FreeWebNovel
code = code.replace(
    /'#content',              \/\/ NovelFire: <div id="content" class="clearfix font_default">/,
    `'#content',              // NovelFire: <div id="content" class="clearfix font_default">
                    '.txt',                  // FreeWebNovel: <div class="txt">`
);

fs.writeFileSync(file, code);
console.log('Modified ' + file);
