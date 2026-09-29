import * as cheerio from 'cheerio';
import * as fs from 'fs';

const html = fs.readFileSync('asura_series_page.html', 'utf-8');
const $ = cheerio.load(html);

console.log('Title:', $('title').text());

// Analyze potential series containers
console.log('\n--- Searching for series items ---');

// Try generic grid or list items
$('div.grid, div.flex').each((i, el) => {
    // Check if this container has many children that look like series items
    const children = $(el).children();
    if (children.length > 5) {
        // Check first child structure
        const first = children.first();
        const hasImg = first.find('img').length > 0;
        const hasA = first.find('a').length > 0;

        if (hasImg && hasA) {
            console.log(`\nPotential Container found at index ${i}:`);
            console.log(`Class: ${$(el).attr('class')}`);
            console.log(`Children count: ${children.length}`);

            const firstItem = $(first);
            console.log('First Item HTML substring:', firstItem.html().substring(0, 200));
            console.log('Title candidates:');
            firstItem.find('h3, h4, span, div').each((_, t) => {
                const txt = $(t).text().trim();
                if (txt && txt.length < 50) console.log(` - ${t.tagName}.${$(t).attr('class')}: "${txt}"`);
            });
            console.log('Link:', firstItem.find('a').attr('href'));
        }
    }
});
