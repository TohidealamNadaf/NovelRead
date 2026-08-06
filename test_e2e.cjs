// Test: what DOES work through the vite proxy?
// From earlier tests: title page returns 20 chapters, chapter page returns 2-6 images
// Let's investigate more carefully what the proxy returns
const cheerio = require('cheerio');

async function fetchViaProxy(url) {
    const proxyUrl = `http://localhost:5173/api/proxy?url=${encodeURIComponent(url)}`;
    const resp = await fetch(proxyUrl, { headers: { 'x-force-puppeteer': 'true' } });
    return await resp.text();
}

async function test() {
    // Test 1: Title page chapter count and pagination info
    console.log('=== Title page analysis ===');
    const titleHtml = await fetchViaProxy('https://mangafire.to/title/92kk8-naruto');
    const $ = cheerio.load(titleHtml);
    
    console.log('HTML length:', titleHtml.length);
    console.log('Title:', $('h1').first().text().trim());
    
    // Count chapters
    const chapters = [];
    $('a[href*="/chapter/"]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const text = $(el).text().trim().substring(0, 50);
        if (!chapters.find(c => c.href === href)) {
            chapters.push({ href, text });
        }
    });
    console.log('Chapter links:', chapters.length);
    if (chapters.length > 0) {
        console.log('First:', chapters[0].text);
        console.log('Last:', chapters[chapters.length - 1].text);
    }
    
    // Check for total chapter count indicator
    const chapterHeader = $('[data-name="chapter"]').attr('data-total') || '';
    console.log('data-total:', chapterHeader);
    
    // Look for data attributes on chapter section
    const chapterSection = $('[data-name="chapter"]');
    if (chapterSection.length > 0) {
        const attrs = {};
        for (const attr of chapterSection[0].attributes || []) {
            attrs[attr.name] = attr.value;
        }
        console.log('Chapter section attrs:', JSON.stringify(attrs));
    }
    
    // Check language dropdown for chapter count
    $('[data-name="chapter"] .dropdown-menu a, .btn-group a[data-code]').each((_, el) => {
        console.log('Language option:', $(el).text().trim(), 'data-code:', $(el).attr('data-code'), 'data-title:', $(el).attr('data-title'));
    });
    
    // Check for manga numeric ID
    const mangaIdMatch = titleHtml.match(/data-id="(\d+)"/);
    console.log('Manga data-id:', mangaIdMatch?.[1] || 'not found');
    
    // Check for window.__config or similar
    const configMatch = titleHtml.match(/window\.__config\s*=\s*(\{[^}]+\})/);
    console.log('window.__config:', configMatch ? configMatch[1].substring(0, 200) : 'not found');
    
    // Find all data-id attributes
    const dataIds = new Set();
    $('[data-id]').each((_, el) => {
        dataIds.add($(el).attr('data-id'));
    });
    console.log('All data-ids on page:', [...dataIds].slice(0, 10));
    
    // Test 2: Chapter images (check what we really get)
    console.log('\n=== Chapter page analysis ===');
    const chapterHtml = await fetchViaProxy('https://mangafire.to/title/92kk8-naruto/chapter/1326884');
    const $ch = cheerio.load(chapterHtml);
    
    console.log('HTML length:', chapterHtml.length);
    
    // Count all images
    const allImgs = [];
    $ch('img').each((_, el) => {
        const src = $ch(el).attr('src') || '';
        const dataSrc = $ch(el).attr('data-src') || '';
        const cls = $ch(el).attr('class') || '';
        if ((src && !src.includes('logo') && !src.includes('icon') && !src.includes('favicon') && !src.includes('.svg')) ||
            (dataSrc && !dataSrc.includes('logo'))) {
            allImgs.push({ src: src.substring(0, 80), dataSrc: dataSrc.substring(0, 80), class: cls });
        }
    });
    console.log('Content images:', allImgs.length);
    allImgs.forEach((img, i) => console.log(`  ${i}: src="${img.src}" data-src="${img.dataSrc}" class="${img.class}"`));
    
    // Check progress bar for total pages
    const maxPages = $ch('[aria-valuemax]').attr('aria-valuemax') || '';
    console.log('Total pages (aria-valuemax):', maxPages);
    
    // Count swiper slides
    const slides = $ch('.swiper-slide').length;
    console.log('Swiper slides:', slides);
    
    // Check if there are image URLs hidden in data attributes or scripts
    const scripts = $ch('script').map((_, el) => $ch(el).html() || '').get();
    for (const script of scripts) {
        if (script.includes('mfcdn') || script.includes('"images"') || script.includes("'images'")) {
            console.log('Script with images/mfcdn:', script.substring(0, 300));
        }
    }
    
    // Check all swiper slide data attributes
    $ch('.swiper-slide').each((i, el) => {
        const attrs = [];
        for (const attr of el.attributes || []) {
            if (attr.name !== 'class' && attr.name !== 'style') {
                attrs.push(`${attr.name}="${attr.value.substring(0, 60)}"`);
            }
        }
        const img = $ch(el).find('img');
        const imgSrc = img.attr('src') || '';
        const imgDataSrc = img.attr('data-src') || '';
        if (i < 5 || attrs.length > 0 || imgSrc || imgDataSrc) {
            console.log(`Slide ${i}: attrs=[${attrs.join(', ')}] img.src="${imgSrc.substring(0, 60)}" img.data-src="${imgDataSrc.substring(0, 60)}"`);
        }
    });
}

test().catch(console.error);
