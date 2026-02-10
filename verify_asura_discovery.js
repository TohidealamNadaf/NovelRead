import * as cheerio from 'cheerio';
import fs from 'fs';

async function verifyDiscovery() {
    console.log('--- Verifying Asura Scans Discovery Parsing (ESM) ---');

    let html;
    try {
        html = fs.readFileSync('asura_home_raw.html', 'utf8');
    } catch (e) {
        console.error('asura_home_raw.html not found. Please run the analyze script first.');
        return;
    }

    const $ = cheerio.load(html);
    const trending = [];
    const popular = [];
    const latest = [];

    // 1. Trending (Carousel slides)
    $('li.slide').each((_, el) => {
        const slide = $(el);
        const a = slide.find('a[href*="series/"]').first();
        const href = a.attr('href');
        if (!href) return;

        const title = slide.find('.ellipsis a').text().trim() || a.find('span.font-bold').text().trim();
        const coverUrl = slide.find('img[alt="poster"]').attr('src') || '';
        const status = slide.find('span.status, .status').text().trim() || 'Ongoing';

        if (title) {
            trending.push({ title, href, coverUrl, status });
        }
    });

    console.log(`Found ${trending.length} Trending items.`);
    if (trending.length > 0) {
        console.log('Sample Trending:', JSON.stringify(trending[0], null, 2));
    }

    // 2. Popular Today & Latest Updates
    $('div.text-white.pt-2').each((_, section) => {
        const header = $(section).find('h3').text().trim();
        const isPopular = header.includes('Popular Today');
        const isLatest = header.includes('Latest Update');

        if (isPopular || isLatest) {
            $(section).find('a[href*="series/"]').each((_, el) => {
                const a = $(el);
                const href = a.attr('href');
                if (!href) return;

                const title = a.find('span.font-bold').text().trim() || a.find('h3').text().trim() || a.text().trim();
                const coverUrl = a.find('img').attr('src') || a.find('img').attr('data-src') || '';

                if (title && !title.toLowerCase().includes('chapter')) {
                    const item = { title: title.replace(/\s+/g, ' ').trim(), href, coverUrl };
                    if (isPopular) popular.push(item);
                    else latest.push(item);
                }
            });
        }
    });

    console.log(`Found ${popular.length} Popular items.`);
    if (popular.length > 0) {
        console.log('Sample Popular:', JSON.stringify(popular[0], null, 2));
    }

    console.log(`Found ${latest.length} Latest items.`);
    if (latest.length > 0) {
        console.log('Sample Latest:', JSON.stringify(latest[0], null, 2));
    }

    if (trending.length > 0 && (popular.length > 0 || latest.length > 0)) {
        console.log('\n✅ DISCOVERY PARSING SUCCESSFUL!');
    } else {
        console.log('\n❌ DISCOVERY PARSING FAILED - SOME SECTIONS MISSING');
    }
}

verifyDiscovery();
