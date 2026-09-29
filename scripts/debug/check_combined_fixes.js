import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

async function testMangaDex() {
    console.log('\n--- TESTING MANGADEX DIRECT ---');
    // Using a sample chapter ID from the user's log
    const chapterId = 'ecd2e5b0-e100-49c6-968a-d39ba41c598e';
    const url = `https://api.mangadex.org/at-home/server/${chapterId}`;

    try {
        const response = await fetch(url, {
            headers: {
                // No User-Agent to simulate browser fetch
                'Accept': 'application/json'
            }
        });
        console.log(`MangaDex Status: ${response.status}`);
        if (response.ok) {
            const data = await response.json();
            console.log(`Success! Images found: ${data.chapter?.data?.length || 0}`);
        } else {
            console.log('MangaDex Failed via direct fetch.');
        }
    } catch (err) {
        console.error('MangaDex Error:', err.message);
    }
}

async function testAsuraSearch() {
    console.log('\n--- TESTING ASURA PERMISSIVE SEARCH ---');
    const url = 'https://asuracomic.net/series?page=1&name=Solo+Leveling';
    const ua = 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.6167.178 Mobile Safari/537.36';
    const BASE_URL = 'https://asuracomic.net';

    try {
        const response = await fetch(url, {
            headers: { 'User-Agent': ua, 'Referer': 'https://asuracomic.net/' }
        });

        const html = await response.text();
        const $ = cheerio.load(html);
        const results = [];

        $('a[href*="/series/"]').each((_, el) => {
            const a = $(el);
            const href = a.attr('href');
            if (!href) return;

            const sourceUrl = href.startsWith('http') ? href : `${BASE_URL}${href.startsWith('/') ? '' : '/'}${href}`;

            // Re-simulating the NEW permissive logic
            let title = a.find('span.font-bold').text().trim() ||
                a.find('span.text-white').text().trim() ||
                a.find('h3').text().trim() ||
                a.find('div.font-bold').first().text().trim();

            if (!title) {
                const tempA = a.clone();
                tempA.find('span.status, .status, .type, .px-1, .absolute, .hidden').remove();
                title = tempA.text().trim();
                if (title.includes('\n')) title = title.split('\n')[0].trim();
            }

            if (!title) title = a.text().trim(); // final fallback

            title = title.replace(/\s+/g, ' ').replace('Chapter', '').trim();

            if (title && title.length > 2 &&
                !title.toLowerCase().includes('home') &&
                !title.toLowerCase().includes('series') &&
                !title.toLowerCase().includes('bookmark')) {
                results.push({ title, sourceUrl });
            }
        });

        console.log(`Asura Search: Found ${results.length} results.`);
        results.slice(0, 3).forEach(r => console.log(` - ${r.title}`));

    } catch (err) {
        console.error('Asura Error:', err);
    }
}

async function run() {
    await testMangaDex();
    await testAsuraSearch();
}

run();
