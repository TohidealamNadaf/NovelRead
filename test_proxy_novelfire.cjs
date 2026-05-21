const https = require('https');

const proxies = [
    'none', // direct
    'https://corsproxy.io/?url=',
    'https://api.codetabs.com/v1/proxy?quest=',
    'https://api.allorigins.win/get?url=',
    'https://thingproxy.freeboard.io/fetch/'
];

const paths = [
    '/',
    '/ranking',
    '/genre-all/sort-new/status-all/all-novel',
    '/genre-all/sort-popular/status-completed/all-novel',
    '/latest-release-novels'
];

async function fetchUrl(url, proxy) {
    let finalUrl = url;
    if (proxy !== 'none') {
        if (proxy.includes('corsproxy.io')) {
            finalUrl = `https://corsproxy.io/?url=${encodeURIComponent(url)}`;
        } else if (proxy.includes('allorigins.win')) {
            finalUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
        } else if (proxy.includes('codetabs.com')) {
            finalUrl = `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`;
        } else if (proxy.includes('thingproxy')) {
            finalUrl = `https://thingproxy.freeboard.io/fetch/${url}`;
        }
    }

    return new Promise((resolve) => {
        const req = https.get(finalUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                resolve({
                    proxy,
                    status: res.statusCode,
                    htmlLength: data.length,
                    snippet: data.substring(0, 300)
                });
            });
        }).on('error', (err) => {
            resolve({ proxy, status: 'error', error: err.message });
        });
        req.setTimeout(5000, () => {
            req.destroy();
            resolve({ proxy, status: 'timeout' });
        });
    });
}

async function run() {
    for (const path of paths) {
        const url = `https://novelfire.net${path}`;
        console.log(`\n--- Testing Path: ${path} ---`);
        for (const proxy of proxies) {
            console.log(`Fetching with proxy: ${proxy}...`);
            const res = await fetchUrl(url, proxy);
            console.log(`  Result: Status ${res.status}, Length ${res.htmlLength}`);
            if (res.status === 200 && res.snippet) {
                console.log(`  Snippet: ${res.snippet.replace(/\s+/g, ' ').substring(0, 150)}`);
            }
        }
    }
}

run();
