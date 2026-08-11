const fs = require('fs');
const html = fs.readFileSync('mangafire_chapter.html', 'utf8');
const cheerio = require('cheerio');
const $ = cheerio.load(html);

console.log('Images in chapter page:');
$('img').each((_, el) => {
    console.log($(el).attr('src'));
});
