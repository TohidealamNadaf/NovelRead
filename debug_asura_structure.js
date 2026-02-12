const puppeteer = require('puppeteer');
const cheerio = require('cheerio');

async function debugAsuraStructure() {
    const url = 'https://asuracomic.net/series/pick-me-up-infinite-gacha-a236fe';
    console.log(`Fetching ${url} with Puppeteer...`);

    let browser;
    try {
        browser = await puppeteer.launch({ headless: "new" });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
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

        // Log first 5 items (likely pinned ones) and last 5 items
        for (let i = 0; i < Math.min(5, items.length); i++) {
            const el = items[i];
            const h3s = $(el).find('h3');
            console.log(`\nItem ${i}:`);
            console.log(`  Href: ${$(el).attr('href')}`);
            console.log(`  H3 Count: ${h3s.length}`);
            h3s.each((idx, h) => {
                console.log(`    H3[${idx}]: "${$(h).text().trim()}"`);
            });
            console.log(`  Combined text: "${$(el).text().trim()}"`);
        }

    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        if (browser) await browser.close();
    }
}

debugAsuraStructure();
