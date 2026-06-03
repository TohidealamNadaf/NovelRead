const fs = require('fs');
const cheerio = require('cheerio');

const homeHtml = fs.readFileSync('freewebnovel.html', 'utf-8');
const $home = cheerio.load(homeHtml);

console.log("=== HOME ===");
$home('.li-row').slice(0, 1).each((i, el) => {
    const title = $home(el).find('.tit a').text().trim();
    const url = $home(el).find('.tit a').attr('href');
    const img = $home(el).find('.pic img').attr('src');
    console.log(`Title: ${title}, URL: ${url}, Img: ${img}`);
});

const novelHtml = fs.readFileSync('freewebnovel_novel.html', 'utf-8');
const $novel = cheerio.load(novelHtml);

console.log("\n=== NOVEL ===");
const novelTitle = $novel('h1.tit').text().trim();
const novelImg = $novel('.pic img').attr('src');
const novelSummary = $novel('.inner').text().trim().slice(0, 100);
console.log(`Novel: ${novelTitle}, Img: ${novelImg}, Summary: ${novelSummary}...`);
console.log("Chapters:");
$novel('.m-newest2 ul li').slice(0, 2).each((i, el) => {
    const chTitle = $novel(el).find('a').attr('title');
    const chUrl = $novel(el).find('a').attr('href');
    console.log(` - ${chTitle}: ${chUrl}`);
});

const chapterHtml = fs.readFileSync('freewebnovel_chapter.html', 'utf-8');
const $chapter = cheerio.load(chapterHtml);

console.log("\n=== CHAPTER ===");
const chapterText = $chapter('.txt').text().trim().slice(0, 100);
console.log(`Text: ${chapterText}...`);

