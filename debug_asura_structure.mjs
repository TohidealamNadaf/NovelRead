import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';

async function debugAsuraStructure() {
    const url = 'https://asuracomic.net/series/pick-me-up-infinite-gacha-a236fe';
    console.log(`Fetching ${url} with Puppeteer...`);

    let browser;
    try {
        browser = await puppeteer.launch({ headless: "new" });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

        // Block images/css for speed
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

        // Wait for chapter list
        try {
            await page.waitForSelector('div.overflow-y-auto a', { timeout: 10000 });
        } catch (e) { console.log("Timeout waiting for selector, continuing with content anyway"); }

        const content = await page.content();

        const $ = cheerio.load(content);

        console.log('--- HTML Structure ---');
        // Find chapter container
        const container = $('div.overflow-y-auto');
        if (!container.length) {
            console.log('No container found!');
            return;
        }

        const items = container.find('a');
        console.log(`Found ${items.length} chapters.`);

        const results = [];
        // Log first 5 items (likely pinned ones) and last 5 items
        for (let i = 0; i < Math.min(5, items.length); i++) {
            const el = items[i];
            const h3s = $(el).find('h3');
            console.log(`\nItem ${i}:`);
            const href = $(el).attr('href');
            console.log(`  Href: ${href}`);
            console.log(`  H3 Count: ${h3s.length}`);

            const h3Texts = [];
            h3s.each((idx, h) => {
                const text = $(h).text().trim();
                h3Texts.push(text);
                console.log(`    H3[${idx}]: "${text}"`);
            });
            const combined = $(el).text().replace(/\s+/g, ' ').trim();
            console.log(`  Combined text: "${combined}"`);

            results.push({
                index: i,
                href,
                h3Count: h3s.length,
                h3Texts,
                combinedText: combined
            });
        }

        const fs = await import('fs');
        fs.writeFileSync('debug_output.json', JSON.stringify(results, null, 2));
        console.log('Written to debug_output.json');

    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        if (browser) await browser.close();
    }
}

debugAsuraStructure();
