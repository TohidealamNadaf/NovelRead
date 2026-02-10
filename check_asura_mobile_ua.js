import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

async function verifyAsuraFix() {
    const url = 'https://asuracomic.net/series?page=1&name=Solo+Leveling';
    const ua = 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.6167.178 Mobile Safari/537.36';
    const BASE_URL = 'https://asuracomic.net';

    try {
        const response = await fetch(url, { headers: { 'User-Agent': ua, 'Referer': 'https://asuracomic.net/' } });
        const html = await response.text();
        const $ = cheerio.load(html);
        const results = [];

        $('a[href*="/series/"]').each((_, el) => {
            const a = $(el);
            const href = a.attr('href');
            if (!href) return;

            // EXACT LOGIC FROM SERVICE
            let title = a.find('span.font-bold').text().trim() ||
                a.find('span.text-white').text().trim() ||
                a.find('h3').text().trim() ||
                a.find('div.font-bold').first().text().trim();

            if (!title) {
                const tempA = a.clone();
                tempA.find('span.status, .status, .type, .px-1').remove();
                title = tempA.text().trim().split('\n')[0].trim();
            }

            title = title.replace(/\s+/g, ' ').trim();

            if (title && title.length > 2 &&
                !title.toLowerCase().includes('home') &&
                !title.toLowerCase().includes('series') &&
                !title.toLowerCase().includes('bookmark') &&
                !title.toLowerCase().includes('site-')) {
                results.push({ title });
            }
        });

        console.log(`VERIFICATION SUCCESS: Found ${results.length} valid results.`);
        results.slice(0, 5).forEach((r, i) => console.log(`${i + 1}. ${r.title}`));

    } catch (err) {
        console.error('Error:', err);
    }
}

verifyAsuraFix();
