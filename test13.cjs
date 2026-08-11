const fs = require('fs');
const html = fs.readFileSync('mangafire_title.html', 'utf8');
const cheerio = require('cheerio');
const $ = cheerio.load(html);

$('script').each((_, el) => {
    const html = $(el).html();
    if (html && (html.includes('ajax') || html.includes('api'))) {
        console.log(html);
    }
});
