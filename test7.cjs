const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  await page.goto('https://mangafire.to/title/ro8ro-all-class-awakening-god-slayer', { waitUntil: 'networkidle2' });
  const html = await page.content();
  fs.writeFileSync('mangafire_title.html', html);
  
  console.log('Saved to mangafire_title.html');
  await browser.close();
})();
