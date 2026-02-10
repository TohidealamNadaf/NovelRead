import fetch from 'node-fetch';

async function testMangaDex() {
    const query = 'Solo leveling';
    const baseUrl = 'https://api.mangadex.org';
    const url = `${baseUrl}/manga?title=${encodeURIComponent(query)}&limit=2&includes[]=cover_art&includes[]=author&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica&order[relevance]=desc`;

    const uas = [
        'NovelReadingApp/1.0',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
    ];

    for (const ua of uas) {
        console.log(`\nTesting with User-Agent: ${ua}`);
        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': ua,
                    'Accept': 'application/json'
                }
            });
            console.log(`Status: ${response.status} ${response.statusText}`);
            if (response.ok) {
                const data = await response.json();
                console.log(`Success! Found ${data.data.length} results.`);
            } else {
                const text = await response.text();
                console.log(`Error body: ${text.substring(0, 200)}`);
            }
        } catch (err) {
            console.error(`Fetch failed: ${err.message}`);
        }
    }
}

testMangaDex();
