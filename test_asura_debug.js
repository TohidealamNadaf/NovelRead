import fs from 'fs';

async function testAsura() {
    const urls = [
        'https://asuratoon.com/?s=solo',
        'https://asuracomic.net/series?page=1&name=solo',
        'https://asuracomic.net/series?page=1&title=solo',
        'https://asuracomic.net/series?search=solo'
    ];

    for (const url of urls) {
        console.log(`\nFetching ${url}...`);
        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                }
            });

            console.log(`Status: ${response.status}`);
            const html = await response.text();
            console.log(`Length: ${html.length}`);

            // Check for search result indicators
            if (html.includes('Solo Leveling')) {
                console.log('Found "Solo Leveling" text!');
            }
            if (html.includes('bsx')) {
                console.log('Found .bsx class!');
            }

            const filename = `asura_debug_${urls.indexOf(url)}.html`;
            fs.writeFileSync(filename, html);
            console.log(`Saved to ${filename}`);

        } catch (error) {
            console.error('Error:', error);
        }
    }
}

testAsura();
