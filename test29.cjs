const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();
  
  await page.goto('https://mangafire.to/title/ro8ro-all-class-awakening-god-slayer');
  
  // Wait for chapters
  await page.waitForSelector('.title-detail__chapters li', { timeout: 15000 });
  
  let chapterCount = 0;
  let newCount = await page.evaluate(() => document.querySelectorAll('.title-detail__chapters li').length);
  
  while (newCount > chapterCount) {
      chapterCount = newCount;
      await page.evaluate(() => {
          const list = document.querySelector('.title-detail__chapters');
          if (list) list.scrollTop = list.scrollHeight;
      });
      await new Promise(r => setTimeout(r, 1000));
      newCount = await page.evaluate(() => document.querySelectorAll('.title-detail__chapters li').length);
      console.log('Chapters loaded:', newCount);
  }
  
  await browser.close();
})();
