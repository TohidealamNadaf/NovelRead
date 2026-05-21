const https = require('https');

const domains = [
    'novelfire.net',
    'novelfire.docs',
    'novelfire.top',
    'novelfire.me',
    'novelfire.com',
    'novelfire.io'
];

async function checkDomain(domain) {
    return new Promise((resolve) => {
        const req = https.get(`https://${domain}/`, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                resolve({ domain, status: res.statusCode, location: res.headers.location, htmlLength: data.length, html: data.substring(0, 100) });
            });
        }).on('error', (err) => {
            resolve({ domain, status: 'error', error: err.message });
        });
        
        req.setTimeout(5000, () => {
            req.destroy();
            resolve({ domain, status: 'timeout' });
        });
    });
}

async function run() {
    for (const domain of domains) {
        console.log(`Checking ${domain}...`);
        const result = await checkDomain(domain);
        console.log(result);
    }
}

run();
