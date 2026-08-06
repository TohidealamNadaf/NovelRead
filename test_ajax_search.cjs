async function test() {
    try {
        const r = await fetch('http://localhost:5173/api/proxy?url=https://mangafire.to/ajax/search?keyword=naruto', {
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        });
        const text = await r.text();
        console.log('Result for /ajax/search:', text.substring(0, 500));
    } catch (e) { console.error(e); }

    try {
        const r = await fetch('http://localhost:5173/api/proxy?url=https://mangafire.to/filter?keyword=naruto', {
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        });
        const text = await r.text();
        console.log('Result for /filter with XMLHttpRequest:', text.substring(0, 500));
    } catch (e) { console.error(e); }
}
test();
