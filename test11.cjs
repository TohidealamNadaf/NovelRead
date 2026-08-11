const fs = require('fs');
const html = fs.readFileSync('mangafire_title.html', 'utf8');
const cheerio = require('cheerio');
const $ = cheerio.load(html);

console.log('Chapters container HTML:');
console.log($('.title-detail__chapters').html()?.substring(0, 1000));
