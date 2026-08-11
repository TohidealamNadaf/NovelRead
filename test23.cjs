const https = require('https');

https.get('https://mangafire.to/title/ro8ro-all-class-awakening-god-slayer/chapter/9348523', (res) => {
    let data = '';
    res.on('data', chunk => { data += chunk; });
    res.on('end', () => {
        const matches = data.match(/<img[^>]+reader-img[^>]+>/g);
        console.log('Raw HTML images:', matches?.length);
    });
}).on('error', console.error);
