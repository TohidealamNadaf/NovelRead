const fs = require('fs');

const isContentPage = (url) => {
    if (!url || url.toLowerCase().includes('.gif')) return false;

    const filename = url.split('/').pop() || '';
    const nameWithoutExt = filename.replace(/\.(jpg|jpeg|png|webp|avif|gif)$/i, '');
    const cleanName = nameWithoutExt.replace(/-optimized|_optimized/i, '');
    const lowerName = cleanName.toLowerCase();

    // Blacklist
    const blacklist = ['logo', 'banner', 'discord', 'promo', 'ad-', '_ad', 'patreon', 'ko-fi', 'credit', 'recruit', 'intro', 'outro'];
    if (blacklist.some(term => lowerName.includes(term))) return false;

    // 1. Numeric
    if (/^\d+$/.test(cleanName)) return true;

    // 2. Prefix + Numeric
    if (/^(page|img|image|p|i)?[-_]?\d+$/i.test(cleanName)) return true;

    // 3. Strict ULID
    if (/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(cleanName)) return true;

    // 4. Hex (Removed in fix, but let's see if images match it)
    if (/^[a-f0-9]{8}$/i.test(cleanName)) return "HEX_MATCH";

    return false;
};

async function run() {
    let output = '';
    const log = (msg) => {
        console.log(msg);
        output += msg + '\n';
    };

    const filePath = 'd:\\NovelReadingApp\\debug_nano_curl.html';
    log(`Reading local file: ${filePath}`);

    log('Analyzing ' + filePath);

    let html = '';
    try {
        html = fs.readFileSync(filePath, 'utf8');
    } catch (e) {
        log('Error reading file: ' + e.message);
        return;
    }

    try {
        log('--- STRATEGY 1: __next_f extraction (New Fix) ---');
        const nextFRegex = /self\.__next_f\.push\(\[1,"(.*?)"\]\)/g;
        let match;
        let fullData = "";
        while ((match = nextFRegex.exec(html)) !== null) {
            let content = match[1];
            content = content.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
            fullData += content;
        }

        if (fullData) {
            log(`Extracted ~${fullData.length} chars of Next.js data.`);

            // Regex for "url":"..."
            const urlRegex = /"url":"(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp|avif))"/g;
            let urlMatch;
            const nextFImages = new Set();

            while ((urlMatch = urlRegex.exec(fullData)) !== null) {
                const imgUrl = urlMatch[1];
                if (!imgUrl.includes('logo') && !imgUrl.includes('icon')) {
                    nextFImages.add(imgUrl);
                }
            }

            const images = Array.from(nextFImages);
            log(`Found ${images.length} images via "url":"..." pattern.`);
            images.forEach((img, i) => {
                log(`[${i}] ${img.split('/').pop()}`);
            });
        } else {
            log('No __next_f data found.');
        }

        log('\n--- STRATEGY 2: Fallback Regex (Old behavior check) ---');
        // This simulates the old behavior that was picking up covers
        const imgRegex = /(?:src|data-src)="([^"]+)"/g;
        const oldImages = [];
        let m;
        while ((m = imgRegex.exec(html)) !== null) {
            const src = m[1];
            if (src.includes('gg.asuracomic.net') || src.includes('storage')) {
                if (!oldImages.includes(src)) oldImages.push(src);
            }
        }
        log(`Old regex found ${oldImages.length} images (likely includes thumbnails).`);
        oldImages.forEach((img, i) => {
            // check if it was found in strategy 1
            const isClean = fullData.includes(`"url":"${img}"`);
            log(`[${i}] ${img.split('/').pop()} [${isClean ? 'Clean' : 'Likely Thumbnail/Ad'}]`);
        });

    } catch (e) {
        log("Error: " + e.message);
    }

    fs.writeFileSync('d:\\NovelReadingApp\\debug_nano_analysis_deep.log', output, 'utf8');
}

run();
