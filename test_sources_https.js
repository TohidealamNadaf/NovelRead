import https from 'node:https';

const sources = [
    { name: 'Asura Scans', url: 'https://asuratoon.com/?s=mount+hua' },
    { name: 'Asura (www)', url: 'https://www.asuratoon.com/?s=mount+hua' },
    { name: 'Mangakakalot', url: 'https://mangakakalot.com/search/story/solo_leveling' },
    { name: 'Manganato (read)', url: 'https://readmanganato.com/manga-dn980422' },
    { name: 'ChapManganato', url: 'https://chapmanganato.to/manga-dn980422' },
    { name: 'Flame Scans', url: 'https://flamecomics.com/?s=solo+leveling' }
];

function fetchUrl(source) {
    return new Promise((resolve) => {
        console.log(`Testing ${source.name}...`);
        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://google.com'
            }
        };

        const req = https.get(source.url, options, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                console.log(`Redirect (${res.statusCode}) to: ${res.headers.location}`);
                // Recursive call for redirect could be here, but just logging is enough for now
                if (res.headers.location.startsWith('http')) {
                    // follow one redirect
                    https.get(res.headers.location, options, (res2) => {
                        handleResponse(res2, resolve);
                    }).on('error', (e) => {
                        console.log(`Redirect Error: ${e.message}`);
                        resolve();
                    });
                    return;
                }
            }
            handleResponse(res, resolve);
        });

        req.on('error', (err) => {
            console.log(`Error: ${err.message}`);
            console.log('---');
            resolve();
        });
    });
}

function handleResponse(res, resolve) {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
        console.log(`Status: ${res.statusCode}`);
        console.log(`Length: ${data.length}`);
        const text = data;

        if (text.includes('Spin the Wheel') || text.includes('Just a moment') || res.statusCode === 403 || res.statusCode === 503) {
            console.log('Blocked/Redirected');
        } else if (text.toLowerCase().includes('mount hua') || text.toLowerCase().includes('solo leveling') || text.includes('result-search') || text.includes('panel-story-info')) {
            console.log('Success (Content found)');
        } else {
            console.log('Unknown Content / Potentially Blocked');
        }
        console.log('---');
        resolve();
    });
}

async function run() {
    for (const source of sources) {
        await fetchUrl(source);
    }
}

run();
