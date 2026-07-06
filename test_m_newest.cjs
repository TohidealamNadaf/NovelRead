const fs = require('fs');
const cheerio = require('cheerio');
const html = fs.readFileSync('freewebnovel_novel.html', 'utf8');
const $ = cheerio.load(html);
console.log($('.m-newest2').html().substring(0, 1000));
