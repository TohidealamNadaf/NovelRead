const cheerio = require('cheerio');

async function test() {
    const rawUrl = 'https://freewebnovel.com/martial-god-asura.html';
    const url = `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(rawUrl)}`;
    
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            }
        });
        const html = await response.text();
        const $ = cheerio.load(html);
        
        console.log("Chapters found in .m-newest2 ul li a: " + $('.m-newest2 ul li a').length);
        console.log("Chapters found in .m-newest1 ul li a: " + $('.m-newest1 ul li a').length);
        console.log("Select elements:", $('select').length);
        
        if ($('select').length > 0) {
            console.log("First select options count:", $('select').first().find('option').length);
            console.log("First select ID:", $('select').first().attr('id'));
            $('select').first().find('option').each((i, el) => {
                if(i < 5) {
                    console.log("Option:", $(el).attr('value'), $(el).text());
                }
            });
        }
        console.log("Page title:", $('title').text());
        
        if (html.includes('Cloudflare') || html.includes('Just a moment')) {
            console.log("Cloudflare detected");
        }
    } catch (e) {
        console.error("Fetch failed", e);
    }
}
test().catch(console.error);
