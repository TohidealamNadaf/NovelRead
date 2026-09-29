const fs = require('fs');
const cheerio = require('cheerio');

const html = fs.readFileSync('fwn_test_cultivate.html', 'utf8');
const $ = cheerio.load(html);

console.log("Chapters in .m-newest2 ul li a:", $('.m-newest2 ul li a').length);
console.log("Chapters in .m-newest1 ul li a:", $('.m-newest1 ul li a').length);

console.log("Select tags:", $('select').length);
$('select').each((i, el) => {
    console.log(`Select ${i} id:`, $(el).attr('id'), 'class:', $(el).attr('class'));
    const options = $(el).find('option');
    console.log(`Select ${i} options count:`, options.length);
    if(options.length > 0) {
        options.each((j, opt) => {
            if (j < 5 || j > options.length - 5) {
                console.log(`  Option ${j}:`, $(opt).attr('value'), $(opt).text());
            }
        });
    }
});

console.log("Pagination links:");
$('.page a, .pagination a, .pager a').each((i, el) => {
    console.log("Page link:", $(el).attr('href'), $(el).text());
});

console.log("Is there Cloudflare block?", html.includes('Cloudflare') || html.includes('Just a moment'));
