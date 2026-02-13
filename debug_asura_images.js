const https = require('https');

// MOCK: The filter logic from WebtoonViewer/AsuraService
const isContentPage = (url) => {
    if (!url || url.toLowerCase().includes('.gif')) return false;

    const filename = url.split('/').pop() || '';
    const nameWithoutExt = filename.replace(/\.(jpg|jpeg|png|webp|avif|gif)$/i, '');
    const cleanName = nameWithoutExt.replace(/-optimized|_optimized/i, '');
    const lowerName = cleanName.toLowerCase();

    const blacklist = ['logo', 'banner', 'discord', 'promo', 'ad-', '_ad', 'patreon', 'ko-fi', 'credit', 'recruit', 'intro', 'outro'];
    if (blacklist.some(term => lowerName.includes(term))) return false;

    if (/^\d+$/.test(cleanName)) return true;
    if (/^(page|img|image|p|i)?[-_]?\d+$/i.test(cleanName)) return true;
    if (/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(cleanName)) return true;
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
    console.log("Fetching Asura homepage to find a chapter...");
    const homeHtml = await fetchUrl('https://asuracomic.net/');

    // Find a chapter link
    // <a href="/series/..." ...>
    // Asura loop: /series/name/chapter/1
    const chapterMatch = homeHtml.match(/href="(\/series\/[^"]+\/chapter\/[^"]+)"/);

    if (!chapterMatch) {
        console.log("Could not find a chapter link on homepage.");
        return;
    }

    const chapterUrl = `https://asuracomic.net${chapterMatch[1]}`;
    console.log(`Testing Chapter: ${chapterUrl}`);

    const html = await fetchUrl(chapterUrl);

    // Extract images (Mocking Cheerio/Regex)
    const imgRegex = /src="([^"]+)"/g;
    let match;
    const images = [];
    while ((match = imgRegex.exec(html)) !== null) {
        if (!images.includes(match[1])) images.push(match[1]);
    }

    // Also try __NEXT_DATA__
    const nextDataMatch = html.match(/<script\s+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
    if (nextDataMatch) {
        try {
            const data = JSON.parse(nextDataMatch[1]);
            const pageProps = data.props?.pageProps;
            const chapterData = pageProps?.chapter?.images || pageProps?.data?.images || [];
            chapterData.forEach(img => {
                const fullUrl = img.startsWith('http') ? img : `https://gg.asuracomic.net/storage/media/${img}`;
                if (!images.includes(fullUrl)) images.push(fullUrl);
            });
        } catch (e) { console.log('NextData parse error', e); }
    }

    console.log(`\nFound ${images.length} potential images.`);
    console.log('--- ANALYSIS ---');

    images.forEach(img => {
        const passed = isContentPage(img);
        const filename = img.split('/').pop();
        if (img.includes('logo') || img.includes('discord') || img.includes('banner')) {
            console.log(`[AD-DETECTED] ${passed ? 'ALLOWED (FAIL)' : 'BLOCKED (OK)'} - ${filename}`);
        } else if (passed) {
            console.log(`[CONTENT] ${filename}`);
        } else {
            console.log(`[SKIPPED] ${filename}`);
        }
    });
}

run();
