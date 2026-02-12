import fetch from 'node-fetch';
import * as fs from 'fs';

const url = 'https://asuracomic.net/series?page=1';

async function fetchSeries() {
    console.log(`Fetching: ${url}`);
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            }
        });
        const html = await response.text();
        fs.writeFileSync('asura_series_page.html', html);
        console.log('Saved to asura_series_page.html');
    } catch (e) {
        console.error('Error:', e.message);
    }
}

fetchSeries();
