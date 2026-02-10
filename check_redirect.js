import fetch from 'node-fetch';

async function checkRedirect() {
    const url = 'https://asuracomic.net/';
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.6167.178 Mobile Safari/537.36',
            },
            redirect: 'manual'
        });

        console.log(`Status: ${response.status}`);
        console.log(`Location: ${response.headers.get('location')}`);

        const response2 = await fetch(url);
        console.log(`Final URL: ${response2.url}`);

    } catch (err) {
        console.error('Error:', err);
    }
}

checkRedirect();
