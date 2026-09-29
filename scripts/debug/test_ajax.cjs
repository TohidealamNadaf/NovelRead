// Direct Puppeteer test: navigate to homepage, then fetch the AJAX from the browser
const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Visit homepage to get cookies
    console.log('Visiting homepage...');
    await page.goto('https://mangafire.to/home', { waitUntil: 'networkidle2', timeout: 45000 });
    await new Promise(r => setTimeout(r, 3000));
    
    const cookies = await page.cookies();
    console.log('Cookies:', cookies.map(c => `${c.name}=${c.value.substring(0, 20)}...`).join(', '));
    
    // Test 1: fetch() from within the browser context
    console.log('\n=== Test: browser fetch() for AJAX chapters ===');
    const result1 = await page.evaluate(async () => {
        try {
            const resp = await fetch('https://mangafire.to/ajax/read/92kk8/chapter/en', {
                headers: {
                    'X-Requested-With': 'XMLHttpRequest',
                    'Accept': 'application/json, text/plain, */*'
                }
            });
            const text = await resp.text();
            return { status: resp.status, length: text.length, preview: text.substring(0, 300), contentType: resp.headers.get('content-type') };
        } catch (e) {
            return { error: e.message };
        }
    });
    console.log('Result:', JSON.stringify(result1));
    
    // Test 2: XMLHttpRequest approach (in case fetch is intercepted)
    console.log('\n=== Test: XHR for AJAX chapters ===');
    const result2 = await page.evaluate(() => {
        return new Promise((resolve) => {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', 'https://mangafire.to/ajax/read/92kk8/chapter/en');
            xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
            xhr.onload = () => resolve({ 
                status: xhr.status, 
                length: xhr.responseText.length, 
                preview: xhr.responseText.substring(0, 300),
                contentType: xhr.getResponseHeader('content-type')
            });
            xhr.onerror = () => resolve({ error: 'XHR error' });
            xhr.send();
        });
    });
    console.log('Result:', JSON.stringify(result2));
    
    // Test 3: fetch for chapter images
    console.log('\n=== Test: browser fetch() for AJAX chapter images ===');
    const result3 = await page.evaluate(async () => {
        try {
            const resp = await fetch('https://mangafire.to/ajax/read/chapter/1326884', {
                headers: {
                    'X-Requested-With': 'XMLHttpRequest',
                    'Accept': 'application/json, text/plain, */*'
                }
            });
            const text = await resp.text();
            let parsed = null;
            try { parsed = JSON.parse(text); } catch(e) {}
            return { 
                status: resp.status, 
                length: text.length, 
                preview: text.substring(0, 300),
                isJson: parsed !== null,
                hasImages: Array.isArray(parsed?.result?.images),
                imageCount: parsed?.result?.images?.length || 0
            };
        } catch (e) {
            return { error: e.message };
        }
    });
    console.log('Result:', JSON.stringify(result3));
    
    // Test 4: Try with Referer header
    console.log('\n=== Test: fetch with Referer header ===');
    const result4 = await page.evaluate(async () => {
        try {
            const resp = await fetch('https://mangafire.to/ajax/read/chapter/1326884', {
                headers: {
                    'X-Requested-With': 'XMLHttpRequest',
                    'Accept': 'application/json, text/plain, */*',
                    'Referer': 'https://mangafire.to/'
                }
            });
            const text = await resp.text();
            let parsed = null;
            try { parsed = JSON.parse(text); } catch(e) {}
            return { 
                status: resp.status, 
                length: text.length, 
                isJson: parsed !== null,
                hasImages: Array.isArray(parsed?.result?.images),
                imageCount: parsed?.result?.images?.length || 0,
                firstChars: text.substring(0, 100)
            };
        } catch (e) {
            return { error: e.message };
        }
    });
    console.log('Result:', JSON.stringify(result4));
    
    await browser.close();
    console.log('\nDone.');
})();
