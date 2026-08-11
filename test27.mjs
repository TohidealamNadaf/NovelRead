import http from 'http';

const options = {
  hostname: 'localhost',
  port: 5173,
  path: '/api/proxy?url=' + encodeURIComponent('https://mangafire.to/title/ro8ro-all-class-awakening-god-slayer/chapter/9348523'),
  headers: {
    'x-force-puppeteer': 'true'
  }
};

http.get(options, (res) => {
    let data = '';
    res.on('data', chunk => { data += chunk; });
    res.on('end', () => {
        require('fs').writeFileSync('mangafire_chapter_proxy.html', data);
        console.log('Proxy length:', data.length);
        const matches = data.match(/<img[^>]+reader-img[^>]+>/g);
        console.log('Proxy reader-imgs:', matches?.length || 0);
    });
}).on('error', console.error);
