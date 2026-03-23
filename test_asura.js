const fs = require('fs');

async function testAsura() {
    const url = 'https://corsproxy.io/?' + encodeURIComponent('https://asurascans.com/comics/solo-max-level-newbie');
    console.log("Fetching:", url);
    
    try {
        const res = await fetch(url);
        const text = await res.text();
        fs.writeFileSync('asura_test.html', text);
        console.log("Saved to asura_test.html, length:", text.length);
        
        const nextDataMatch = text.match(/<script id=\"__NEXT_DATA__\"[^>]*>(.+?)<\/script>/);
        if (nextDataMatch) {
            console.log("Found NEXT_DATA!");
            const data = JSON.parse(nextDataMatch[1]);
            const props = data.props?.pageProps;
            if (props?.serie) {
                console.log("Serie Data found! Chapters count:", props.serie.chapters?.length);
            } else {
                console.log("Props keys:", Object.keys(props || {}));
            }
        } else {
            console.log("No NEXT_DATA. Looking for window state...");
            const scriptMatches = [...text.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)];
            scriptMatches.forEach((m, idx) => {
                const content = m[1];
                if (content.includes('chapters') || content.includes('window.__')) {
                    console.log(`Found interesting script [${idx}]:`, content.substring(0, 100));
                }
            });
        }
    } catch(e) {
        console.error("Fetch failed:", e);
    }
}

testAsura();
