const https = require('https');

https.get('https://mangafire.to/home', (res) => {
    let data = '';
    res.on('data', chunk => { data += chunk; });
    res.on('end', () => {
        const titleMatches = data.match(/href="(\/title\/[^"]+)"/g);
        const mangaMatches = data.match(/href="(\/manga\/[^"]+)"/g);
        
        console.log('Titles:', titleMatches?.slice(0, 5));
        console.log('Mangas:', mangaMatches?.slice(0, 5));
    });
}).on('error', console.error);
