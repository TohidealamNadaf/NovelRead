const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('request', request => {
    if (request.url().includes('mangafire.to')) {
      console.log('Request:', request.url());
    }
  });
  
  await page.goto('https://mangafire.to/title/ro8ro-all-class-awakening-god-slayer/chapter/9348523', { waitUntil: 'networkidle2' });
  
  await browser.close();
})();
