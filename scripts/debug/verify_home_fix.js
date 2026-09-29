import * as cheerio from 'cheerio';
import * as fs from 'fs';

const html = fs.readFileSync('asura_home.html', 'utf-8');
const $ = cheerio.load(html);

const BASE_URL = 'https://asuracomic.net';
const latest = [];
const seenUrls = new Set();

console.log('--- Testing Home Fix ---');

$('div.text-white').each((_, section) => {
    const header = $(section).find('h3').text().trim();
    if (header.includes('Latest Update')) {
        console.log(`\nFound Section: ${header}`);

        $(section).find('a[href*="series/"]').each((_, el) => {
            const a = $(el);
            let href = a.attr('href') || '';
            if (!href) return;

            let sourceUrl = href.startsWith('http') ? href : `${BASE_URL}${href.startsWith('/') ? '' : '/'}${href}`;

            // --- THE FIX ---
            if (sourceUrl.includes('?genre=') || sourceUrl.includes('/chapter/')) return;
            // ----------------

            const titleRaw = a.find('span.font-bold').text().trim() || a.find('h3').text().trim() || a.text().trim();
            const title = titleRaw.replace(/\s+/g, ' ').replace('MANHWA', '').trim();
            const coverUrl = a.find('img').attr('src') || a.find('img').attr('data-src') || '';

            if (title || coverUrl) {
                const existing = latest.find(item => item.sourceUrl === sourceUrl);

                if (existing) {
                    if (title && (existing.title === 'Loading...' || !existing.title)) {
                        existing.title = title;
                    }
                    if (coverUrl && !existing.coverUrl) {
                        existing.coverUrl = coverUrl;
                    }
                } else {
                    const item = {
                        title: title || 'Loading...',
                        sourceUrl,
                        coverUrl
                    };
                    latest.push(item);
                }
            }
        });
    }
});

console.log(`\nExtracted ${latest.length} items for Latest Updates:`);
latest.forEach((item, i) => {
    console.log(`[${i}] Title: "${item.title}", URL: ${item.sourceUrl}`);
});

if (latest.some(item => item.title.toLowerCase().includes('chapter'))) {
    console.error('\nFAILED: Still found chapter links in the list!');
} else {
    console.log('\nSUCCESS: No chapter links found in the list.');
}
