const https = require('https');
const fs = require('fs');

// MOCK: The filter logic from WebtoonViewer/AsuraService
const isContentPage = (url) => {
    if (!url || url.toLowerCase().includes('.gif')) return false;

    const filename = url.split('/').pop() || '';
    const nameWithoutExt = filename.replace(/\.(jpg|jpeg|png|webp|avif|gif)$/i, '');
    const cleanName = nameWithoutExt.replace(/-optimized|_optimized/i, '');
    const lowerName = cleanName.toLowerCase();

    // Blacklist common ad/promo keywords
    const blacklist = ['logo', 'banner', 'discord', 'promo', 'ad-', '_ad', 'patreon', 'ko-fi', 'credit', 'recruit', 'intro', 'outro'];
    if (blacklist.some(term => lowerName.includes(term))) return false;

    // Pattern 1: Purely numeric
    if (/^\d+$/.test(cleanName)) return true;

    // Pattern 2: Prefix + number (Restrictive)
    if (/^(page|img|image|p|i)?[-_]?\d+$/i.test(cleanName)) return true;

    // Pattern 3: Strict ULID (Asura)
    if (/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(cleanName)) return true;

    // Pattern 4: Strict Hex (8 chars)
    if (/^[a-f0-9]{8}$/i.test(cleanName)) return true;

    return false;
};

// Fetch function
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

    log("Fetching Asura homepage to find a chapter...");
    try {
        const homeHtml = await fetchUrl('https://asuracomic.net/');

        // Find a recent chapter link
        const chapterMatch = homeHtml.match(/href="(\/series\/[^"]+\/chapter\/[^"]+)"/);

        if (!chapterMatch) {
            log("Could not find a chapter link on homepage.");
            // Fallback to a known URL if possible or just exit
            fs.writeFileSync('d:\\NovelReadingApp\\debug_results.log', output, 'utf8');
            return;
        }

        const chapterUrl = `https://asuracomic.net${chapterMatch[1]}`;
        log(`Testing Chapter: ${chapterUrl}`);

        const html = await fetchUrl(chapterUrl);

        const images = [];

        // 1. Regex Extraction (Fallback)
        const imgRegex = /src="([^"]+)"/g;
        let match;
        while ((match = imgRegex.exec(html)) !== null) {
            const src = match[1];
            if (src.includes('gg.asuracomic.net') || src.includes('wp-content') || src.includes('storage')) {
                if (!images.includes(src)) images.push(src);
            }
        }

        // 2. Next Data Extraction (Primary)
        const nextDataMatch = html.match(/<script\s+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
        if (nextDataMatch) {
            try {
                const data = JSON.parse(nextDataMatch[1]);
                const pageProps = data.props?.pageProps;
                const chapterData = pageProps?.chapter?.images || pageProps?.data?.images || [];
                if (Array.isArray(chapterData)) {
                    chapterData.forEach(img => {
                        const fullUrl = img.startsWith('http') ? img : `https://gg.asuracomic.net/storage/media/${img}`;
                        // Mark these as "FROM JSON"
                        // We just add to images list to see if filter accepts them
                        if (!images.includes(fullUrl)) images.push(fullUrl);
                    });
                }
            } catch (e) { log('NextData parse error: ' + e); }
        }

        log(`\nFound ${images.length} potential images.`);
        log('--- ANALYSIS ---');

        images.forEach(img => {
            const passed = isContentPage(img);
            const filename = img.split('/').pop();
            if (passed) {
                log(`[ALLOWED] ${filename}`);
            } else {
                log(`[BLOCKED] ${filename} (Filter rejected)`);
            }
        });

    } catch (e) {
        log("Run failed: " + e);
    }

    fs.writeFileSync('d:\\NovelReadingApp\\debug_results.log', output, 'utf8');
}

run();
