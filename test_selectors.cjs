const cheerio = require('cheerio');
const fs = require('fs');

const homeHtml = fs.readFileSync('mangafire_headless_out.html', 'utf8');
const $ = cheerio.load(homeHtml);

console.log('--- DISCOVER / HOME ---');
$('.home-section__item').each((_, el) => {
    const $el = $(el);
    const $a = $el.find('a[href*="/title/"]').first();
    const href = $a.attr('href');
    const title = $el.find('h6, .title, strong').text().trim() || $el.text().replace(/\n/g, '').trim();
    const cover = $el.find('img').attr('src') || $el.find('img').attr('data-src');
    
    if (href) {
        console.log(`Href: ${href} | Title: ${title} | Cover: ${cover}`);
    }
});

console.log('\n--- DETAILS ---');
try {
    const detailsHtml = fs.readFileSync('mangafire_details_out.html', 'utf8');
    const $d = cheerio.load(detailsHtml);
    console.log('Title:', $d('h1').text().trim());
    console.log('Cover:', $d('img[src*="cover"], .poster img, img[alt*="cover"]').attr('src') || $d('.text-center img').attr('src'));
    console.log('Synopsis:', $d('.modal-body p').text().trim() || $d('p.text-sm').text().trim());
} catch (e) {
    console.log('No details html found', e);
}
