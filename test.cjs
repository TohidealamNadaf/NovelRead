const cheerio = require('cheerio');
fetch('https://novelfire.net/ranking/ratings').then(r=>r.text()).then(t=>{
    const $ = cheerio.load(t);
    const novels = [];
    $('.novel-item, .list-novel .row, .item').each((_, el) => {
        const $el = $(el);
        const titleEl = $el.find('.novel-title a, h3 a, a[title]').first();
        let title = titleEl.text().trim() || titleEl.attr('title')?.trim() || '';
        novels.push(title);
    });
    console.log("Novels found:", novels.length);
    if(novels.length > 0) console.log("First:", novels[0]);
    else {
        console.log("Found h3:", $('h3').length);
        console.log("Found .novel-item:", $('.novel-item').length);
        console.log("Found .list-novel:", $('.list-novel').length);
        console.log("Found .item:", $('.item').length);
    }
}).catch(e=>console.log(e));
