const fs = require('fs');
const cheerio = require('cheerio');
const html = fs.readFileSync('freewebnovel_novel.html', 'utf8');
const $ = cheerio.load(html);
const els = $('*:contains("Load")').filter((i, el) => $(el).children().length === 0 && $(el).text().trim().includes('Load'));
els.each((i, el) => {
    console.log(`Element ${i}:`, el.tagName, $(el).attr('href'), $(el).attr('class'), $(el).attr('id'), $(el).text());
});
