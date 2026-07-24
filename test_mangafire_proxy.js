import fetch from 'node-fetch'; // We can just use global fetch in Node 18+
import fs from 'fs';

async function test() {
    try {
        const url = 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent('https://mangafire.to/home');
        console.log('Fetching', url);
        const res = await fetch(url);
        const text = await res.text();
        fs.writeFileSync('mangafire_proxy_out.html', text);
        console.log('Saved to mangafire_proxy_out.html, length:', text.length);
        
        // Let's also check for specific selectors
        const hasUnitItem = text.includes('unit-item');
        const hasTitleGrid = text.includes('title-grid');
        console.log('Contains unit-item:', hasUnitItem);
        console.log('Contains title-grid:', hasTitleGrid);
    } catch (e) {
        console.error(e);
    }
}
test();
