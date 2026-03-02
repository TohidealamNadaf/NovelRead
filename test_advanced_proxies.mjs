import fs from 'fs';

async function fetchHtml(url, proxyUrl) {
    let finalUrl = `${proxyUrl}${encodeURIComponent(url)}`;
    if (proxyUrl.includes('allorigins')) finalUrl = `${proxyUrl}${encodeURIComponent(url)}`;
    else if (proxyUrl.includes('codetabs')) finalUrl = `${proxyUrl}${encodeURIComponent(url)}`;
    else if (proxyUrl.includes('thingproxy')) finalUrl = `${proxyUrl}${url}`;
    else if (proxyUrl.includes('corsproxy.io')) finalUrl = `${proxyUrl}${encodeURIComponent(url)}`;

    console.log(`Testing: ${proxyUrl}`);
    try {
        const response = await fetch(finalUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            },
            signal: AbortSignal.timeout(5000)
        });

        let html = '';
        if (proxyUrl.includes('allorigins.win')) html = (await response.json()).contents || '';
        else html = await response.text();

        if (html.includes('chr-content')) {
            console.log(`\n✅ SUCCESS: ${proxyUrl}`);
            return true;
        } else if (html.includes('challenge-form') || html.includes('Just a moment')) {
            console.log(`❌ BLOCK: Cloudflare`);
        } else {
            console.log(`❌ ERROR: Unknown HTML returned`);
        }
    } catch (e) {
        console.log(`❌ ERROR: ${e.message}`);
    }
    return false;
}

async function main() {
    const proxies = [
        'https://corsproxy.io/?url=',
        'https://api.allorigins.win/get?url=',
        'https://api.codetabs.com/v1/proxy?quest=',
        'https://thingproxy.freeboard.io/fetch/',
        'https://api.allorigins.win/raw?url=',
        'https://cors-anywhere.herokuapp.com/'
    ];

    const url = 'https://novelbin.me/novel-book/shadow-slave/chapter-1';

    let success = false;
    for (const p of proxies) {
        if (await fetchHtml(url, p)) {
            success = true;
        }
    }
    if (!success) console.log('\nAll proxies failed. We need a different approach.');
}
main();
