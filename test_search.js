const cheerio = require('cheerio');
fetch('http://localhost:5173/api/proxy?url=https://mangafire.to/filter?keyword=naruto')
    .then(r => r.text())
    .then(html => {
        const $ = cheerio.load(html);
        console.log('Original Selectors:', $('.home-section__item, .title-grid__item, .title-list-item, .filter-item').length);
        console.log('New Selectors:', $('.unit-item, .manga-item').length);
        
        if ($('.unit-item, .manga-item').length === 0 && $('.home-section__item, .title-grid__item, .title-list-item, .filter-item').length === 0) {
            console.log('Raw HTML snippet:', html.substring(0, 1000));
        }
    })
    .catch(console.error);
