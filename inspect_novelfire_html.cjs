const https = require('https');
const cheerio = require('cheerio');

function fetchUrlDirect(url) {
    return new Promise((resolve, reject) => {
        https.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    resolve(data);
                } else {
                    reject(new Error(`HTTP ${res.statusCode}`));
                }
            });
        }).on('error', reject);
    });
}

async function run() {
    try {
        console.log("Fetching ranking page...");
        const rankingHtml = await fetchUrlDirect('https://novelfire.net/ranking');
        const $ = cheerio.load(rankingHtml);
        
        const firstItem = $('.novel-item').first();
        if (firstItem.length > 0) {
            console.log("\n--- HTML of a single .novel-item ---");
            console.log(firstItem.html().substring(0, 2000));
            console.log("------------------------------------\n");
            
            // Let's test scraping selectors on this item:
            console.log("Testing selectors on the first item:");
            console.log("Title: ", firstItem.find('h4, h3, h2, .novel-title, a[href*="/book/"]').first().text().trim());
            console.log("Link href: ", firstItem.find('a[href*="/book/"]').first().attr('href'));
            console.log("Image src/data-src: ", firstItem.find('img').attr('data-src') || firstItem.find('img').attr('src'));
            console.log("Author text: ", firstItem.find('.author, [class*="author"]').text().trim());
            console.log("Status text: ", firstItem.find('.status, [class*="status"]').text().trim());
            console.log("Summary/Description: ", firstItem.find('.description, .excerpt, [class*="desc"]').text().trim());
        } else {
            console.log("No .novel-item elements found!");
        }
        
    } catch (err) {
        console.error("Error:", err);
    }
}

run();
