import puppeteer from 'puppeteer';
import fs from 'fs';

async function testHeadless() {
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    
    // Pretend to be a real browser
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
    
    console.log('Navigating to mangafire.to/home...');
    await page.goto('https://mangafire.to/home', { waitUntil: 'networkidle2' });
    
    const html = await page.content();
    fs.writeFileSync('mangafire_headless_out.html', html);
    console.log('Saved to mangafire_headless_out.html, length:', html.length);
    
    const hasUnitItem = html.includes('unit-item');
    const hasTitleGrid = html.includes('title-grid');
    console.log('Contains unit-item:', hasUnitItem);
    console.log('Contains title-grid:', hasTitleGrid);
    
    // Let's get the title link of the first item to go to details page
    const firstLink = await page.evaluate(() => {
        const item = document.querySelector('.unit-item a, .title-grid__link, a[href*="/manga/"]');
        return item ? item.href : null;
    });
    console.log('First manga link:', firstLink);
    
    if (firstLink) {
        console.log('Navigating to details page:', firstLink);
        await page.goto(firstLink, { waitUntil: 'networkidle2' });
        const detailsHtml = await page.content();
        fs.writeFileSync('mangafire_details_out.html', detailsHtml);
        console.log('Saved details to mangafire_details_out.html, length:', detailsHtml.length);
    }
    
    await browser.close();
}

testHeadless();
