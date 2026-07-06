const cheerio = require('cheerio');

const jsonResponse = {
    html: '<li title="Chapter 41"><a href="/novel/who-let-him-cultivate-wx/chapter-41">Chapter 41</a></li><li title="Chapter 42"><a href="/novel/who-let-him-cultivate-wx/chapter-42">Chapter 42</a></li>'
};

const rawHtml = JSON.stringify(jsonResponse);
let htmlToParse = rawHtml;
if (rawHtml.trim().startsWith('{')) {
    try {
        const data = JSON.parse(rawHtml);
        if (data.html) htmlToParse = data.html;
    } catch (e) {}
}

const $ = cheerio.load(htmlToParse);

let chapters = [];
// simulate old extractChapters
$('.m-newest2 ul li a').each((_, el) => { chapters.push($(el).text()); });
if (chapters.length === 0) {
    $('ul.list-chapter li a, .chapters li a, .chapter-list li a').each((_, el) => { chapters.push($(el).text()); });
}

console.log("Old logic chapters count:", chapters.length);

// simulate new extractChapters
if (chapters.length === 0) {
    $('a').each((_, el) => {
        const link = el.attribs?.href;
        if (!link || (!link.toLowerCase().includes('chapter') && !link.match(/\/\d+/))) return;
        chapters.push($(el).text());
    });
}
console.log("New logic chapters count:", chapters.length);
console.log("Chapters:", chapters);
