const fs = require('fs');
const cheerio = require('cheerio');

const html = fs.readFileSync('ranking.html', 'utf-8');
const $ = cheerio.load(html);
const novels = [];

$('.novel-item, .list-novel .row, .item').each((_, el) => {
    const $el = $(el);
    const titleEl = $el.find('.novel-title a, h3 a, a[title]').first();
    let title = titleEl.text().trim() || titleEl.attr('title')?.trim() || '';
    if (!title) return;
    
    let novelUrl = titleEl.attr('href') || '';
    let coverUrl = $el.find('img').first().attr('src') || $el.find('img').first().attr('data-src') || '';
    
    novels.push({ title, novelUrl, coverUrl });
});

console.log("Found:", novels.length);
if (novels.length > 0) {
    console.log(novels.slice(0, 3));
} else {
    console.log("No novels found! Selectors might be wrong.");
    // try to find what the items actually are
    console.log("Checking structure...");
    const wrapper = $('.novel-list, .list-novel, .genre-list, .list').first();
    console.log("Wrapper found:", wrapper.length);
    if (wrapper.length) {
        console.log("Children classes:", wrapper.children().map((i, el) => $(el).attr('class')).get());
    }
}
