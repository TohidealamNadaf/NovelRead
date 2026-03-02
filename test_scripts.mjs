import fs from 'fs';
import * as cheerio from 'cheerio';

async function main() {
    const html = fs.readFileSync('nb_test.html', 'utf8');
    const $ = cheerio.load(html);

    // Look for `#list-chapter` which often contains the chapters
    const listChapter = $('#list-chapter');
    console.log('Has #list-chapter:', listChapter.length > 0);

    // Sometimes there's a `<div class="row" id="list-chapter">`
    console.log('List chapter items:', listChapter.find('ul li a').length);

    // Look for a raw JS array declaration of chapters or an API endpoint
    const scriptWithText = $('script').map((i, el) => $(el).text()).get().find(s => s.includes('novelId') || s.includes('chapters') || s.includes('total_page'));
    if (scriptWithText) {
        console.log('Found script with novel variables:');
        console.log(scriptWithText.substring(0, 300));
    }
}
main();
