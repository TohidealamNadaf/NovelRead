const fs = require('fs');
const html = fs.readFileSync('mangafire_title.html', 'utf8');
const cheerio = require('cheerio');
const $ = cheerio.load(html);

console.log('Scripts:');
$('script').each((_, el) => {
    const src = $(el).attr('src');
    if (src) console.log(src);
});
console.log('\nData attributes on chapter wrapper:');
console.log($('.title-detail__chapters').html()?.substring(0, 300));
