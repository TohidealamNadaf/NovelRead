const https = require('https');
const cheerio = require('cheerio');

https.get('https://freewebnovel.com/sort/latest-release', res => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
        const $ = cheerio.load(data);
        console.log('li-row:', $('.li-row').length);
        console.log('div.li:', $('div.li').length);
        
        console.log('First 2 div.li:');
        $('div.li').slice(0, 2).each((i, el) => {
            console.log($(el).html());
        });
        
        console.log('First 2 .li-row:');
        $('.li-row').slice(0, 2).each((i, el) => {
            console.log($(el).html());
        });
    });
});
