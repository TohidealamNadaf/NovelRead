const sources = [
    { name: 'Asura Scans', url: 'https://asuratoon.com/?s=mount+hua' },
    { name: 'Mangakakalot', url: 'https://mangakakalot.com/search/story/solo_leveling' },
    { name: 'Manganato', url: 'https://manganato.com/search/story/solo_leveling' },
    { name: 'Flame Scans', url: 'https://flamecomics.com/?s=solo+leveling' },
    { name: 'Mangafire', url: 'https://mangafire.to/ajax/manga/search?keyword=solo%20leveling' }
];

async function test() {
    for (const source of sources) {
        try {
            console.log(`Testing ${source.name}...`);
            const res = await fetch(source.url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Referer': 'https://google.com'
                }
            });
            console.log(`Status: ${res.status}`);
            const text = await res.text();
            console.log(`Length: ${text.length}`);

            if (text.includes('Spin the Wheel') || text.includes('Just a moment')) {
                console.log('Blocked/Redirected');
            } else if (text.toLowerCase().includes('mount hua') || text.toLowerCase().includes('solo leveling') || text.includes('result-search')) {
                console.log('Success (Content found)');
            } else {
                console.log('Unknown Content');
            }
        } catch (e) {
            console.log(`Error: ${e.message}`);
        }
        console.log('---');
    }
}

test();
