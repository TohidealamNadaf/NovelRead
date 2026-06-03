const fs = require('fs');
const cheerio = require('cheerio');

const homeHtml = fs.readFileSync('freewebnovel.html', 'utf-8');
const $home = cheerio.load(homeHtml);

console.log("=== HOME ===");
$home('.ul-list1 li').slice(0, 5).each((i, el) => {
    const title = $home(el).find('.tit a').attr('title') || $home(el).find('.tit a').text().trim();
    const url = $home(el).find('.tit a').attr('href');
    const img = $home(el).find('.pic img').attr('src');
    console.log(`List 1 - Title: ${title}, URL: ${url}, Img: ${img}`);
});

$home('.li-row').slice(0, 2).each((i, el) => {
    const title = $home(el).find('.tit a').attr('title') || $home(el).find('.tit a').text().trim();
    const url = $home(el).find('.tit a').attr('href');
    const img = $home(el).find('.pic img').attr('src');
    console.log(`Li-row - Title: ${title}, URL: ${url}, Img: ${img}`);
});
