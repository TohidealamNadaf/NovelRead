const puppeteer = require('puppeteer');

async function test() {
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    
    // Set a normal user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36');
    
    try {
        await page.goto('https://freewebnovel.com/who-let-him-cultivate-wx.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
        // Wait a bit for cloudflare
        await new Promise(r => setTimeout(r, 5000));
        
        const html = await page.content();
        require('fs').writeFileSync('fwn_test_cultivate.html', html);
        console.log("Saved HTML");
    } catch (e) {
        console.error(e);
    } finally {
        await browser.close();
    }
}
test();
