const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto('https://mangafire.to/home');
  const html = await page.content();
  
  const matches = html.match(/href="([^"]+)"/g);
  console.log('Hrefs:', matches?.slice(0, 20));
  
  await browser.close();
})();
