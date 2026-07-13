const fs = require('fs'); const html = fs.readFileSync('latest_novel.html', 'utf8'); const cheerio = require('cheerio'); const $ = cheerio.load(html); console.log($('title').text());
