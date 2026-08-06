const fs = require('fs');
const cheerio = require('cheerio');
const $ = cheerio.load(fs.readFileSync('puppeteer_html.html', 'utf8'));

// Extract all title URLs from the browse/search page
$('.title-rows__link').each((i, el) => {
    const href = $(el).attr('href');
    const title = $(el).find('.title-row-card__title').text().trim();
    if (i < 10) console.log(`${title}: ${href}`);
});
