const fs = require('fs');
const html = fs.readFileSync('mangafire_title.html', 'utf8');
const cheerio = require('cheerio');
const $ = cheerio.load(html);

$('script').each((_, el) => {
    const html = $(el).html();
    if (html && (html.includes('{') || html.includes('['))) {
        console.log('--- Script ---');
        console.log(html.substring(0, 300));
    }
});
