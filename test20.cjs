const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  await page.goto('https://mangafire.to/title/ro8ro-all-class-awakening-god-slayer/chapter/9348523', { waitUntil: 'networkidle2' });
  const html = await page.content();
  fs.writeFileSync('mangafire_chapter.html', html);
  
  const images = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('img'));
      return imgs.map(img => img.src).filter(src => src.includes('chapter'));
  });
  console.log('Chapter images:', images.slice(0, 5));
  
  await browser.close();
})();
