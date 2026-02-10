import fs from 'fs';

async function testAsuraChapter() {
    // URL derived from detail page analysis
    const url = 'https://asuracomic.net/series/solo-leveling-a4b483cd/chapter/200';
    console.log(`Fetching ${url}...`);

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            }
        });

        console.log(`Status: ${response.status}`);
        const html = await response.text();
        console.log(`Length: ${html.length}`);

        fs.writeFileSync('asura_chapter.html', html);
        console.log('Saved to asura_chapter.html');

    } catch (error) {
        console.error('Error:', error);
    }
}

testAsuraChapter();
