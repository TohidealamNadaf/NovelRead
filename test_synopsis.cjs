const https = require('https');
const cheerio = require('cheerio');

const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.82 Mobile Safari/537.36';

function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        const options = {
            hostname: parsed.hostname,
            path: parsed.pathname + parsed.search,
            method: 'GET',
            headers: {
                'User-Agent': MOBILE_UA,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Referer': `${parsed.origin}/`,
            }
        };
        const req = https.get(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode, html: data }));
        });
        req.on('error', reject);
    });
}

async function main() {
    const res = await fetchUrl('https://novelfire.net/book/shadow-slave');
    const $ = cheerio.load(res.html);
    
    console.log("meta description:", $('meta[name="description"]').attr('content'));
    
    // Check possible synopsis containers
    console.log("summary__content:", $('.summary__content').text().substring(0, 100));
    console.log("description:", $('.description').text().substring(0, 100));
    console.log("#editdescription:", $('#editdescription').text().substring(0, 100));
    console.log(".book-info-desc:", $('.book-info-desc').text().substring(0, 100));
    console.log(".content:", $('.content').text().substring(0, 100));
    console.log(".summary-content:", $('.summary-content').text().substring(0, 100));
    console.log("#novel-info summary?", $('#novel-info').text().substring(0, 100));
    
    // Let's just find a chunk of text that looks like the synopsis
    // Look for a section with "Synopsis" or "Summary"
    $('div, section, p').each((i, el) => {
        const text = $(el).text();
        if (text.includes("Growing up in poverty") || text.includes("Sunny") || text.length > 500) {
            const classList = $(el).attr('class');
            const id = $(el).attr('id');
            if (classList || id) {
                // console.log(`Found text in element with class="${classList}" id="${id}"`);
            }
        }
    });

    // Output all div classes to see structure
    const classes = new Set();
    $('div').each((i, el) => {
        if ($(el).attr('class')) classes.add($(el).attr('class'));
    });
    console.log("All div classes:", Array.from(classes).filter(c => c.includes('desc') || c.includes('sum') || c.includes('synop')));
    
    // Output text of specific elements
    console.log("\nTrying .summary:");
    console.log($('.summary').text().substring(0, 200));
}

main();
