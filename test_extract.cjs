const fs = require('fs');
const cheerio = require('cheerio');
const html = fs.readFileSync('test.html', 'utf8');
const $ = cheerio.load(html);
console.log('Title:', $('h1.tit').text());
console.log('Author text:', $('[title*="Author"]').text() || $('.txt').text().match(/Author[^\n]*/)?.[0]);
console.log('Status:', $('.txt').text().match(/(Status|State)[^\n]*/)?.[0]);
console.log('TXT text:', $('.txt').text().substring(0, 500));
