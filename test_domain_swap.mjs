import fs from 'fs';
import * as cheerio from 'cheerio';

async function fetchHtml(url, proxyUrl) {
    let finalUrl = url;
    if (proxyUrl) {
        if (proxyUrl.includes('corsproxy.io')) {
            finalUrl = `https://corsproxy.io/?url=${encodeURIComponent(url)}`;
        } else if (proxyUrl.includes('allorigins.win')) {
            finalUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
        }
    }

    try {
        const response = await fetch(finalUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            }
        });

        let html = '';
        if (proxyUrl.includes('allorigins.win')) {
            html = (await response.json()).contents || '';
        } else {
            html = await response.text();
        }
        return html;
    } catch (e) {
        return '';
    }
}

async function main() {
    const proxies = [
        '', // Direct
        'https://corsproxy.io/?url=',
        'https://api.allorigins.win/get?url='
    ];

    // NovelBin URL: https://novelbin.me/novel-book/shadow-slave/chapter-1
    // Equivalent NovelFire URL: https://novelfire.net/novel/shadow-slave/chapter-1
    const targetUrl = 'https://novelfire.net/novel/shadow-slave/chapter-1';

    let success = false;
    for (const p of proxies) {
        const html = await fetchHtml(targetUrl, p);
        if (html) {
            const $ = cheerio.load(html);
            const content = $('#chr-content').text().trim();
            if (content.length > 100) {
                console.log(`\n✅ NovelFire fallback worked with proxy: ${p || 'Direct'}`);
                console.log(`Content snippet: ${content.substring(0, 100)}...`);
                success = true;
                break;
            }
        }
    }
    if (!success) console.log('❌ NovelFire fallback also blocked.');
}
main();
