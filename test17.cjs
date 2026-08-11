const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('request', request => {
    if (request.url().includes('mangafire.to')) {
      console.log('Request:', request.url());
    }
  });
  
  await page.goto('https://mangafire.to/title/ro8ro-all-class-awakening-god-slayer', { waitUntil: 'networkidle2' });
  
  // click language dropdown or chapters to see if it triggers ajax
  try {
      await page.waitForSelector('.title-detail__tabs');
      await page.click('.title-detail__tabs');
      await page.waitForTimeout(2000);
  } catch(e) {}
  
  await browser.close();
})();
