const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('ajax')) {
          console.log('AJAX URL:', url);
          try {
              const text = await response.text();
              console.log('AJAX Response start:', text.substring(0, 100));
          } catch(e) {}
      }
  });
  
  await page.goto('https://mangafire.to/title/ro8ro-all-class-awakening-god-slayer', { waitUntil: 'networkidle2' });
  
  await browser.close();
})();
