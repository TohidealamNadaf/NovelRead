import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import fs from 'fs';

async function checkUrl(url, proxyUrl) {
    let finalUrl = proxyUrl ? `${proxyUrl}${encodeURIComponent(url)}` : url;
    if (proxyUrl && proxyUrl.includes('allorigins.win')) {
        finalUrl = `${proxyUrl}${encodeURIComponent(url)}`;
    }
    console.log(`Checking: ${finalUrl}`);
    try {
        const res = await fetch(finalUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        let html;
        if (proxyUrl && proxyUrl.includes('allorigins.win')) {
            html = (await res.json()).contents;
        } else {
            html = await res.text();
        }

        const $ = cheerio.load(html || '');
        const content = $('#chr-content').text().trim();
        if (content.length > 50) {
            console.log(`✅ Success for ${finalUrl} (Content len: ${content.length})`);
            return { success: true, contentLength: content.length };
        } else {
            let reason = 'Unknown';
            if (html?.includes('Cloudflare') || html?.includes('Just a moment')) {
                reason = 'Blocked by Cloudflare';
            } else if (html?.includes('Not Found')) {
                reason = '404 Not Found';
            }
            console.log(`❌ Failed. Reason: ${reason}`);
            return { success: false, reason, htmlLength: html?.length };
        }
    } catch (e) {
        console.log(`❌ Error fetching ${finalUrl}: ${e.message}`);
        return { success: false, error: e.message };
    }
}

async function main() {
    const novelBinUrl = 'https://novelbin.me/novel-book/follow-the-path-of-dao-from-infancy/chapter-1-bestowing-a-name-li-hao';
    const novelFireUrl = 'https://novelfire.net/novel/follow-the-path-of-dao-from-infancy/chapter-1-bestowing-a-name-li-hao';
    const novelFireShortUrl = 'https://novelfire.net/novel/follow-the-path-of-dao-from-infancy/chapter-1';

    const results = {};
    results['NovelBin'] = await checkUrl(novelBinUrl, '');
    results['NovelFire_Exact'] = await checkUrl(novelFireUrl, '');
    results['NovelFire_Short'] = await checkUrl(novelFireShortUrl, '');
    results['NovelFire_Short_Cors'] = await checkUrl(novelFireShortUrl, 'https://corsproxy.io/?url=');

    fs.writeFileSync('output_tests.json', JSON.stringify(results, null, 2));
    console.log("Done! Written to output_tests.json");
}

main();
