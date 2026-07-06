const fs = require('fs');

async function test() {
    try {
        const url = encodeURIComponent('https://freewebnovel.com/who-let-him-cultivate-wx.html');
        // Let's try some CORS proxies that might bypass CF
        const proxyUrls = [
            `https://api.allorigins.win/raw?url=${url}`,
            `https://corsproxy.io/?${url}`,
            `https://api.codetabs.com/v1/proxy/?quest=${url}`
        ];
        
        let success = false;
        for (const proxy of proxyUrls) {
            console.log("Trying", proxy);
            const res = await fetch(proxy);
            if (res.ok) {
                const html = await res.text();
                if (!html.includes('Cloudflare') && !html.includes('Just a moment')) {
                    fs.writeFileSync('fwn_real.html', html);
                    console.log("Success with", proxy);
                    console.log("Saved fwn_real.html, length:", html.length);
                    success = true;
                    break;
                } else {
                    console.log("Blocked by Cloudflare via", proxy);
                }
            } else {
                console.log("HTTP error", res.status);
            }
        }
        
        if (!success) {
            console.log("All proxies failed to bypass Cloudflare.");
        }
    } catch (e) {
        console.error(e);
    }
}
test();
