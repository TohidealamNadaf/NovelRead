
import * as cheerio from 'cheerio';
import fs from 'fs';

const logFile = 'd:\\NovelReadingApp\\debug_log.txt';
fs.writeFileSync(logFile, ''); // Clear log

function log(msg) {
    console.log(msg);
    fs.appendFileSync(logFile, msg + '\n');
}

// Mock the service logic - STRICT FILTERING
function isContentPage(url) {
    if (!url) return false;
    if (url.toLowerCase().includes('.gif')) {
        // log(`[REJECTED - GIF] ${url}`);
        return false;
    }

    const filename = url.split('/').pop() || '';
    const nameWithoutExt = filename.replace(/\.(jpg|jpeg|png|webp|avif|gif)$/i, '');
    const cleanName = nameWithoutExt.replace(/-optimized|_optimized/i, '');

    // Pattern 1: Purely numeric
    if (/^\d+$/.test(cleanName)) return true;

    // Pattern 2: Simple prefix + number
    if (/^[a-zA-Z0-9_-]{0,15}[-_]?\d+$/.test(cleanName)) return true;

    // Pattern 3: ULID (Asura's new format) -> 26 chars, starts with 0-7
    if (/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(cleanName)) return true;

    // Pattern 4: 8-char hex (short hash)
    if (/^[a-f0-9]{8}$/i.test(cleanName)) return true;

    // log(`[REJECTED - UUID/Complex] ${cleanName} | ${url}`);
    return false;
}

async function debugAsuraChapter() {
    const url = 'https://asuracomic.net/series/standard-of-reincarnation-0453f631/chapter/111';
    log(`Fetching ${url}...`);

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            }
        });

        const html = await response.text();
        log(`HTML Length: ${html.length}`);

        // 1. Try __NEXT_DATA__
        const nextDataMatch = html.match(/<script\s+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
        if (nextDataMatch && nextDataMatch[1]) {
            log('Found __NEXT_DATA__ payload.');
            const json = JSON.parse(nextDataMatch[1]);
            const pageProps = json?.props?.pageProps;
            const chapterData = pageProps?.chapter || pageProps?.data || pageProps;

            if (chapterData?.images && Array.isArray(chapterData.images)) {
                const images = chapterData.images;
                log(`Found ${images.length} images in JSON.`);

                // In new logic: WE TRUST __NEXT_DATA__ order and content (just filter GIFs)
                const accepted = images.filter(img => img && !img.toLowerCase().includes('.gif') && !img.includes('logo.webp'));

                log(`Accepted ${accepted.length} / ${images.length} images (Trusted Source).`);
                accepted.forEach((img, i) => {
                    if (i < 3) log(`[Sample ${i}] ${img}`);
                });
                return;
            } else {
                log('__NEXT_DATA__ found but no direct images array.');
            }
        }

        // 2. Fallback to Cheerio/Regex
        log('No valid __NEXT_DATA__ content, using Regex Fallback...');
        const urlRegex = /https?:\/\/[^"'\s\\]+\.(?:jpg|jpeg|png|webp|avif)/gi;
        const matches = html.match(urlRegex) || [];
        const unique = new Set(matches);
        const images = Array.from(unique);

        log(`Found ${images.length} images via Regex.`);
        let acceptedCount = 0;
        images.forEach(img => {
            if (isContentPage(img)) {
                acceptedCount++;
                if (acceptedCount <= 3) log(`[Filtered Accepted] ${img}`);
            } else {
                // log(`[Filtered Rejected] ${img}`);
            }
        });
        log(`Accepted ${acceptedCount} / ${images.length} images after filtering.`);

    } catch (e) {
        log(`Error: ${e.message}`);
    }
}

debugAsuraChapter();
