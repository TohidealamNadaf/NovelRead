async function run() {
    try {
        console.log('Fetching...');
        const response = await fetch('https://comick.art/comic/00-solo-leveling', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            }
        });

        console.log('Status:', response.status);
        const html = await response.text();
        console.log('Got HTML, length:', html.length);

        const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.+?)<\/script>/);
        if (match) {
            const json = JSON.parse(match[1]);
            console.log('FOUND DATA!');

            // Log some keys to verify structure
            if (json.props && json.props.pageProps) {
                const props = json.props.pageProps;
                console.log('Keys:', Object.keys(props));
                if (props.comic) {
                    console.log('Title:', props.comic.title);
                    console.log('HID:', props.comic.hid);
                }
                // Try to find where chapter list is
                // Often it's not in pageProps for large lists on initial load, but maybe some recent ones are there.
                // Actually, comick uses client-side fetching for chapters usually.
                // Let's see if we can get the buildId to construct API calls to _next/data/
                console.log('BuildId:', json.buildId);
            }
        } else {
            console.log('NO NEXT_DATA FOUND');
        }
    } catch (e) {
        console.error('Error:', e);
    }
}

run();
