// Debug script to inspect Asura chapter HTML structure for image ordering
// Usage: node debug_asura_images.mjs <chapter_url>

const url = process.argv[2] || 'https://asuracomic.net/series/pick-me-up-infinite-gacha-830ad6/chapter/1';

console.log(`\n=== Fetching: ${url} ===\n`);

try {
    const response = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': 'https://asuracomic.net/',
        }
    });

    if (!response.ok) {
        console.error(`HTTP Error: ${response.status}`);
        process.exit(1);
    }

    const html = await response.text();
    console.log(`HTML length: ${html.length} chars\n`);

    // 1. Check for __NEXT_DATA__
    const nextDataMatch = html.match(/<script\s+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
    if (nextDataMatch && nextDataMatch[1]) {
        console.log('=== __NEXT_DATA__ FOUND ===');
        try {
            const nextData = JSON.parse(nextDataMatch[1]);
            const pageProps = nextData?.props?.pageProps;

            if (pageProps) {
                console.log('\nTop-level pageProps keys:', Object.keys(pageProps));

                // Explore each key
                for (const key of Object.keys(pageProps)) {
                    const val = pageProps[key];
                    if (val && typeof val === 'object') {
                        if (Array.isArray(val)) {
                            console.log(`\n  pageProps.${key}: Array[${val.length}]`);
                            if (val.length > 0) {
                                console.log(`    First item:`, JSON.stringify(val[0]).slice(0, 200));
                                if (val.length > 1) console.log(`    Second item:`, JSON.stringify(val[1]).slice(0, 200));
                            }
                        } else {
                            console.log(`\n  pageProps.${key}: Object with keys:`, Object.keys(val));
                            // Go one level deeper
                            for (const subKey of Object.keys(val)) {
                                const subVal = val[subKey];
                                if (Array.isArray(subVal)) {
                                    console.log(`    .${subKey}: Array[${subVal.length}]`);
                                    if (subVal.length > 0) {
                                        console.log(`      First item:`, JSON.stringify(subVal[0]).slice(0, 300));
                                        if (subVal.length > 1) console.log(`      Second item:`, JSON.stringify(subVal[1]).slice(0, 300));
                                    }
                                } else if (typeof subVal === 'object' && subVal !== null) {
                                    console.log(`    .${subKey}: Object with keys:`, Object.keys(subVal));
                                } else {
                                    console.log(`    .${subKey}:`, String(subVal).slice(0, 100));
                                }
                            }
                        }
                    } else {
                        console.log(`  pageProps.${key}:`, String(val).slice(0, 100));
                    }
                }
            } else {
                console.log('No pageProps found. Top-level keys:', Object.keys(nextData));
                console.log('props keys:', nextData?.props ? Object.keys(nextData.props) : 'N/A');
            }
        } catch (e) {
            console.error('Failed to parse __NEXT_DATA__:', e.message);
        }
    } else {
        console.log('=== NO __NEXT_DATA__ FOUND ===');
    }

    // 2. Check for image URLs via regex
    const urlRegex = /https?:\/\/[^"'\s\\]+\.(?:jpg|jpeg|png|webp|avif)/gi;
    const allMatches = html.match(urlRegex) || [];
    const asuraImages = allMatches.filter(u =>
        u.includes('gg.asuracomic.net') &&
        !u.includes('logo') && !u.includes('icon') &&
        !u.includes('thumb') && !u.includes('avatar') && !u.includes('cover')
    );

    console.log(`\n=== REGEX IMAGE EXTRACTION ===`);
    console.log(`Total regex matches: ${allMatches.length}`);
    console.log(`Asura chapter images: ${asuraImages.length}`);

    // Show unique images and their filenames (which often contain page numbers)
    const uniqueImages = [...new Set(asuraImages)];
    console.log(`Unique images: ${uniqueImages.length}`);
    console.log('\nFirst 10 images (with filenames):');
    uniqueImages.slice(0, 10).forEach((img, i) => {
        const filename = img.split('/').pop();
        console.log(`  [${i}] ${filename}`);
    });

    if (uniqueImages.length > 10) {
        console.log(`  ... and ${uniqueImages.length - 10} more`);
        console.log('\nLast 3 images:');
        uniqueImages.slice(-3).forEach((img, i) => {
            const filename = img.split('/').pop();
            console.log(`  [${uniqueImages.length - 3 + i}] ${filename}`);
        });
    }

    // 3. Check for numbered filenames and analyze order
    console.log('\n=== FILENAME NUMBER ANALYSIS ===');
    const numbered = uniqueImages.map((img, originalIndex) => {
        const filename = img.split('/').pop() || '';
        // Extract number from filename
        const numMatch = filename.match(/(\d+)/);
        const num = numMatch ? parseInt(numMatch[1]) : -1;
        return { originalIndex, filename: filename.slice(0, 60), num, url: img };
    });

    // Check if numbers are monotonically increasing
    let isOrdered = true;
    for (let i = 1; i < numbered.length; i++) {
        if (numbered[i].num < numbered[i - 1].num && numbered[i].num !== -1) {
            isOrdered = false;
            console.log(`  OUT OF ORDER at index ${i}: ${numbered[i - 1].filename} (${numbered[i - 1].num}) -> ${numbered[i].filename} (${numbered[i].num})`);
        }
    }

    if (isOrdered) {
        console.log('  ✅ Images appear to be in numeric order already');
    } else {
        console.log('\n  ❌ Images are NOT in numeric order!');
        console.log('  Sorted order would be:');
        const sorted = [...numbered].sort((a, b) => a.num - b.num);
        sorted.slice(0, 5).forEach((img, i) => {
            console.log(`    [${i}] ${img.filename} (num: ${img.num})`);
        });
    }

    // 4. Look for other script-embedded JSON with image arrays
    console.log('\n=== EMBEDDED JSON SEARCH ===');
    const scriptMatches = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi) || [];
    console.log(`Total <script> tags: ${scriptMatches.length}`);

    for (let i = 0; i < scriptMatches.length; i++) {
        const scriptContent = scriptMatches[i];
        if (scriptContent.includes('gg.asuracomic.net') && !scriptContent.includes('__NEXT_DATA__')) {
            console.log(`\n  Script #${i} contains asura image URLs (${scriptContent.length} chars)`);
            // Try to find JSON arrays
            const jsonArrayMatch = scriptContent.match(/\[[\s\S]*?gg\.asuracomic\.net[\s\S]*?\]/);
            if (jsonArrayMatch) {
                console.log(`  Found JSON array (${jsonArrayMatch[0].length} chars)`);
                console.log(`  Preview: ${jsonArrayMatch[0].slice(0, 300)}...`);
            }
        }
    }

} catch (error) {
    console.error('Error:', error);
}
