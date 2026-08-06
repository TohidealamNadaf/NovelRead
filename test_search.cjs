const cheerio = require('cheerio');
fetch('http://localhost:5173/api/proxy?url=https://mangafire.to/browse?keyword=naruto&sort=relevance:desc', {
    headers: { 'x-force-puppeteer': 'true' }
})
    .then(r => r.text())
    .then(html => {
        const $ = cheerio.load(html);
        const titles = [];
        $('.unit-item, .manga-item, .home-section__item, .title-grid__item, .title-list-item, .filter-item').each((_, el) => {
            const title = $(el).find('h6, .title, strong').first().text().trim() || $(el).text().replace(/\n/g, '').trim();
            if (title) titles.push(title);
        });
        console.log('Found titles:', titles.length);
        console.log(titles.slice(0, 10).join(', '));
        if (titles.length === 0) {
            console.log('Raw HTML snippet:', html.substring(0, 1000));
        }
    })
    .catch(console.error);
