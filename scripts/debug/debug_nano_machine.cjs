const https = require('https');
const fs = require('fs');

const fetchUrl = (url) => {
    return new Promise((resolve, reject) => {
        const req = https.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://asuracomic.net/'
            }
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve(data));
        });
        req.on('error', reject);
    });
};

async function run() {
    let output = '';
    const log = (msg) => {
        console.log(msg);
        output += msg + '\n';
    };

    const seriesUrl = 'https://asuracomic.net/series/nano-machine-159d6f56';
    log(`Fetching Series Page: ${seriesUrl}`);

    try {
        const seriesHtml = await fetchUrl(seriesUrl);

        // Find Chapter 293 link
        // <a href="/series/nano-machine-159d6f56/chapter/293">
        const match = seriesHtml.match(/href="([^"]+chapter\/293)"/);

        if (!match) {
            log("Could not find Chapter 293 link on series page.");
            // Dump some links
            const links = seriesHtml.match(/href="([^"]+chapter\/[^"]+)"/g) || [];
            log(`Found ${links.length} chapter links. Sample: ${links.slice(0, 3).join(', ')}`);
            fs.writeFileSync('d:\\NovelReadingApp\\debug_nano_traversal.log', output, 'utf8');
            return;
        }

        const chapterPath = match[1];
        const chapterUrl = `https://asuracomic.net${chapterPath}`;
        log(`Found Chapter URL: ${chapterUrl}`);

        const html = await fetchUrl(chapterUrl);
        log(`Fetched ${html.length} bytes.`);

        // Check for images
        const nextDataMatch = html.match(/<script\s+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
        let images = [];

        if (nextDataMatch) {
            try {
                const data = JSON.parse(nextDataMatch[1]);
                const pageProps = data.props?.pageProps;
                const chapterData = pageProps?.chapter?.images || pageProps?.data?.images || [];
                if (Array.isArray(chapterData)) {
                    chapterData.forEach(img => {
                        const fullUrl = img.startsWith('http') ? img : `https://gg.asuracomic.net/storage/media/${img}`;
                        if (!images.includes(fullUrl)) images.push(fullUrl);
                    });
                }
            } catch (e) { log('NextData parse error: ' + e); }
        } else {
            log("-> No NEXT_DATA found. Dumping first 500 chars:");
            log(html.substring(0, 500));
        }

        // Fallback Regex
        if (images.length === 0) {
            const imgRegex = /src="([^"]+)"/g;
            let m;
            while ((m = imgRegex.exec(html)) !== null) {
                const src = m[1];
                if (src.includes('gg.asuracomic.net') || src.includes('storage')) {
                    if (!images.includes(src)) images.push(src);
                }
            }
        }

        log(`Found ${images.length} images.`);
        log('--- IMAGES ---');
        images.forEach(img => log(img));

    } catch (e) {
        log("Error: " + e.message);
    }

    fs.writeFileSync('d:\\NovelReadingApp\\debug_nano_traversal.log', output, 'utf8');
}

run();
