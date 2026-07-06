const puppeteer = require('puppeteer');
const cheerio = require('cheerio');

async function test() {
    console.log("Launching puppeteer...");
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    const url = 'https://freewebnovel.com/martial-god-asura.html';
    
    console.log("Navigating to", url);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    
    const html = await page.content();
    const $ = cheerio.load(html);
    
    console.log("Chapters found in .m-newest2 ul li a: " + $('.m-newest2 ul li a').length);
    
    // Check if there's a select tag for chapters
    console.log("Select elements:", $('select').length);
    if ($('select').length > 0) {
        $('select').first().find('option').each((i, el) => {
            if(i < 5 || i > $('select').first().find('option').length - 5) {
                console.log("Option:", $(el).attr('value'), $(el).text());
            }
        });
    }

    console.log("Pagination links:");
    $('.page a').each((i, el) => {
        console.log("Page link:", $(el).attr('href'), $(el).text());
    });
    
    await browser.close();
}
test().catch(console.error);
