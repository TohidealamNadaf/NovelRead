const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  await page.goto('https://mangafire.to/title/ro8ro-all-class-awakening-god-slayer');
  
  const response = await page.evaluate(async () => {
      const res = await fetch('https://mangafire.to/api/titles/ro8ro/chapters?language=en&sort=number&order=desc&page=1&limit=500', {
          headers: {
              'X-Requested-With': 'XMLHttpRequest',
              'Accept': 'application/json, text/javascript, */*; q=0.01'
          }
      });
      return await res.text();
  });
  
  console.log('API Response without VRF:', response.substring(0, 500));
  
  await browser.close();
})();
