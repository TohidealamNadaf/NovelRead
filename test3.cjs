const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto('https://mangafire.to/home');
  const html = await page.content();
  
  const titleMatches = html.match(/href="(\/title\/[^"]+)"/g);
  const mangaMatches = html.match(/href="(\/manga\/[^"]+)"/g);
  
  console.log('Titles:', titleMatches?.slice(0, 5));
  console.log('Mangas:', mangaMatches?.slice(0, 5));
  
  await browser.close();
})();
