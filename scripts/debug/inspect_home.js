import * as cheerio from 'cheerio';
import * as fs from 'fs';

const html = fs.readFileSync('asura_home.html', 'utf-8');
const $ = cheerio.load(html);

let out = '--- Inspecting Home Page ---\n';

$('div.text-white').each((_, section) => {
    const header = $(section).find('h3').text().trim();
    if (header.includes('Latest Update')) {
        out += `\nFound Section: ${header}\n`;

        // Let's find all links and see what they are
        $(section).find('a[href*="series/"]').each((i, el) => {
            if (i > 40) return;
            const a = $(el);
            const href = a.attr('href');
            const text = a.text().trim();
            const fontBold = a.find('span.font-bold').text().trim();
            const hasImg = a.find('img').length > 0;

            out += `[${i}] Href: ${href}, Text: "${text}", FontBold: "${fontBold}", HasImg: ${hasImg}\n`;
        });
    }
});

fs.writeFileSync('home_inspect_results.txt', out);
console.log('Results written to home_inspect_results.txt');
