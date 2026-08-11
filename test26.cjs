const https = require('https');

const options = {
  hostname: 'mangafire.to',
  path: '/title/ro8ro-all-class-awakening-god-slayer',
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
  }
};

https.get(options, (res) => {
    let data = '';
    res.on('data', chunk => { data += chunk; });
    res.on('end', () => {
        console.log('Includes chapters?', data.includes('chapter'));
        console.log('Data length:', data.length);
        if (data.length > 10000) {
            console.log(data.substring(0, 500));
        }
    });
}).on('error', console.error);
