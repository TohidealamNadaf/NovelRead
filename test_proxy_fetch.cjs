const http = require('http');
const cheerio = require('cheerio');

http.get('http://localhost:5173/api/proxy?url=https%3A%2F%2Fnovelfire.net%2Fsearch%3Fkeyword%3Dmartial', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        const $ = cheerio.load(data);
        const firstItem = $('.novel-item').first();
        console.log("First item HTML:", firstItem.html());
    });
}).on('error', console.error);
