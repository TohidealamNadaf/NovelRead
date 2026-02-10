import fs from 'fs';
import * as cheerio from 'cheerio';

async function verifyParsing() {
    try {
        const html = fs.readFileSync('asura_search_mobile_utf8.html', 'utf8');
        const $ = cheerio.load(html);
        const BASE_URL = 'https://asuracomic.net';
        const results = [];
        const seenUrls = new Set();

        console.log('--- Starting Verification ---');
        console.log('Selector: a[href*="series/"]');

        $('a[href*="series/"]').each((_, el) => {
            const a = $(el);
            const href = a.attr('href');
            if (!href) return;

            const sourceUrl = href.startsWith('http') ? href : `${BASE_URL}${href.startsWith('/') ? '' : '/'}${href}`;
            if (seenUrls.has(sourceUrl)) return;
            seenUrls.add(sourceUrl);

            let title = a.find('span.font-bold').text().trim() ||
                a.find('span.text-white').text().trim() ||
                a.find('h3').text().trim() ||
                a.find('.font-bold').first().text().trim() ||
                a.find('.text-white').first().text().trim();

            if (!title) {
                const tempA = a.clone();
                tempA.find('span.status, .status, .type, .px-1, .absolute, .hidden').remove();
                title = tempA.text().trim();
                if (title.includes('\n')) title = title.split('\n')[0].trim();
            }

            if (!title) title = a.text().trim();
            title = title.replace(/\s+/g, ' ').replace('Chapter', '').trim();

            const img = a.find('img');
            const coverUrl = img.attr('src') ||
                img.attr('data-src') ||
                img.attr('data-lazy-src') ||
                img.attr('srcset')?.split(' ')[0] ||
                img.attr('data-srcset')?.split(' ')[0] || '';

            const status = a.find('span.status, .status').text().trim() || 'Ongoing';

            if (title && title.length > 2 &&
                !title.toLowerCase().includes('home') &&
                !title.toLowerCase().includes('series') &&
                !title.toLowerCase().includes('bookmark')) {
                results.push({ title, sourceUrl, coverUrl, status });
            }
        });

        console.log(`Found ${results.length} results.`);
        results.slice(0, 5).forEach((r, i) => {
            console.log(`\nResult ${i + 1}:`);
            console.log(`  Title: ${r.title}`);
            console.log(`  URL:   ${r.sourceUrl}`);
            console.log(`  Cover: ${r.coverUrl}`);
            console.log(`  Status: ${r.status}`);
        });

        if (results.length > 0) {
            console.log('\nSUCCESS: Parsing logic verified.');
        } else {
            console.log('\nFAILURE: No results found with new selectors.');
        }
    } catch (error) {
        console.error('Execution Error:', error);
    }
}

verifyParsing();
