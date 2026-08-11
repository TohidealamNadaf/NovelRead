const fs = require('fs');
const html = fs.readFileSync('mangafire_title.html', 'utf8');
const links = html.match(/href="([^"]+\/chapter\/[^"]+)"/g);
console.log('Chapter links count:', links?.length);
console.log('Sample:', links?.slice(0, 5));
