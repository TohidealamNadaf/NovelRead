const fs = require('fs');
const cheerio = require('cheerio');
const html = fs.readFileSync('freewebnovel_novel.html', 'utf8');
const $ = cheerio.load(html);

console.log('.m-newest1 ul li a:', $('.m-newest1 ul li a').length);
console.log('.m-newest2 ul li a:', $('.m-newest2 ul li a').length);
console.log('ul.list-chapter li a:', $('ul.list-chapter li a').length);
console.log('.chapters li a:', $('.chapters li a').length);
console.log('.chapter-list li a:', $('.chapter-list li a').length);
console.log('#idData li a:', $('#idData li a').length);
