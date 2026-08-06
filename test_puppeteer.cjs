const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Intercept XHR requests to find API calls the reader makes
    const networkRequests = [];
    page.on('request', req => {
        const url = req.url();
        if (url.includes('ajax') || url.includes('api') || url.includes('chapter') || url.includes('mfcdn')) {
            networkRequests.push({ url: url.substring(0, 150), method: req.method() });
        }
    });
    
    await page.goto('https://mangafire.to/title/92kk8-naruto/chapter/1326884', { waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {});
    await page.waitForSelector('.reader-img, .reader', { timeout: 15000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 5000));
    
    console.log('=== Network requests ===');
    networkRequests.forEach(r => console.log(`${r.method} ${r.url}`));
    
    // Check swiper slides and their data attributes
    const slideData = await page.evaluate(() => {
        const slides = document.querySelectorAll('.swiper-slide');
        return Array.from(slides).map(s => {
            const img = s.querySelector('img');
            return {
                class: s.className.substring(0, 80),
                hasImg: !!img,
                imgSrc: img?.src?.substring(0, 80) || '',
                imgDataSrc: img?.getAttribute('data-src')?.substring(0, 80) || '',
                imgLoading: img?.getAttribute('loading') || '',
                imgClass: img?.className?.substring(0, 60) || '',
                slideDataAttrs: Array.from(s.attributes).filter(a => a.name.startsWith('data-')).map(a => `${a.name}=${a.value.substring(0, 40)}`),
            };
        });
    });
    
    console.log('\n=== Swiper slides ===');
    slideData.forEach((s, i) => {
        console.log(`Slide ${i}: img=${s.hasImg} src="${s.imgSrc}" data-src="${s.imgDataSrc}" class="${s.imgClass}" loading="${s.imgLoading}" data=${s.slideDataAttrs.join(', ')}`);
    });
    
    // Check if there's window.__data or similar
    const windowData = await page.evaluate(() => {
        const keys = Object.keys(window).filter(k => k.startsWith('__') || k.includes('manga') || k.includes('reader'));
        const result = {};
        keys.forEach(k => {
            try {
                const val = window[k];
                if (typeof val === 'object' && val !== null) {
                    result[k] = JSON.stringify(val).substring(0, 300);
                } else if (typeof val === 'string' && val.length > 10) {
                    result[k] = val.substring(0, 300);
                }
            } catch(e) {}
        });
        return result;
    });
    console.log('\n=== Window data ===');
    Object.entries(windowData).forEach(([k, v]) => console.log(`${k}: ${v}`));
    
    // Check script content for image URLs
    const scripts = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('script')).map(s => {
            const text = s.textContent || '';
            if (text.includes('mfcdn') || text.includes('images')) {
                return text.substring(0, 500);
            }
            return null;
        }).filter(Boolean);
    });
    console.log('\n=== Scripts with image/mfcdn data ===');
    scripts.forEach((s, i) => console.log(`Script ${i}:`, s));
    
    await browser.close();
})();
