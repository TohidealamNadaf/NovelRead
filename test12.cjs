const fs = require('fs');
const html = fs.readFileSync('mangafire_title.html', 'utf8');
const cheerio = require('cheerio');
const $ = cheerio.load(html);

console.log('Main wrapper:');
console.log($('.title-detail').html()?.substring(0, 1000));
console.log($('[data-id]').length, 'elements with data-id');
$('[data-id]').each((_, el) => {
    if ($(el).attr('class')) {
        console.log($(el).attr('class'), $(el).attr('data-id'));
    }
});
