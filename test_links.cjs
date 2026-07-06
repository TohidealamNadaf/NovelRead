const fs = require('fs');
const cheerio = require('cheerio');

const html = fs.readFileSync('freewebnovel_novel.html', 'utf8');
const $ = cheerio.load(html);

console.log("Total:", $('.m-newest2 ul li a').length);
$('.m-newest2 ul li a').each((i, el) => {
    if (i < 5 || i > 405) {
        console.log(`[${i}] href:`, $(el).attr('href'), "title:", $(el).attr('title'));
    }
});
