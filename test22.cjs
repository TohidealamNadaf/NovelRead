const fs = require('fs');
const html = fs.readFileSync('mangafire_chapter.html', 'utf8');
const cheerio = require('cheerio');
const $ = cheerio.load(html);

$('img').each((_, el) => {
    console.log('src:', $(el).attr('src'));
    console.log('class:', $(el).attr('class'));
    console.log('data-src:', $(el).attr('data-src'));
});
