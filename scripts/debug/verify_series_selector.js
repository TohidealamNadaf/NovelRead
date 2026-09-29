import * as cheerio from 'cheerio';
import * as fs from 'fs';

const html = fs.readFileSync('asura_series_page.html', 'utf-8');
const $ = cheerio.load(html);

let log = '--- Testing Selectors ---\n';

// Proposed Refined Selector: target the specific grid container
// The class string in HTML is "grid grid-cols-2 sm:grid-cols-2 md:grid-cols-5 gap-3 p-4"
// We can target parts of it.
const gridSelector = 'div.grid.grid-cols-2.md\\:grid-cols-5';

const items = $(gridSelector).find('a[href*="series/"]');
log += `Found ${items.length} items using selector: ${gridSelector} a[href*="series/"]\n`;

items.each((i, el) => {
    if (i > 10) return; // limit output
    const a = $(el);
    // Based on previous attempt, span.font-bold might be "MANHWA" tag
    // Let's try to find the real title.
    const titleSpan = a.find('span').not(':contains("MANHWA")').not('.status').first().text().trim();
    const titleFallback = a.find('span.font-bold').last().text().trim();
    const link = a.attr('href');
    const img = a.find('img').attr('src');

    log += `[${i}] RealTitle: "${titleSpan}", Tag: "${a.find('span.font-bold').first().text().trim()}", Link: "${link}", Img: "${img?.substring(0, 50)}..."\n`;
});

// Compare with broad selector
const broadItems = $('a[href*="series/"]');
log += `\nBroad selector found ${broadItems.length} items.\n`;

fs.writeFileSync('selector_results.txt', log);
console.log('Results written to selector_results.txt');
