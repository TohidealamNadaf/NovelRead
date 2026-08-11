const https = require('https');

https.get('https://mangafire.to/title/ro8ro-all-class-awakening-god-slayer/chapter/9348523', (res) => {
    let data = '';
    res.on('data', chunk => { data += chunk; });
    res.on('end', () => {
        console.log('Includes image?', data.includes('12a3db61fa0f4f41a69a794d93a7e8049234a8465ebba1b2574473f7e468d0832f54de144e6520ecff35c2'));
        console.log('Data length:', data.length);
        require('fs').writeFileSync('mangafire_chapter_raw.html', data);
    });
}).on('error', console.error);
