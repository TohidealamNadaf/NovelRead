const fs = require('fs');
const html = fs.readFileSync('mangafire_title.html', 'utf8');
const matches = html.match(/ajax[^"']+/g);
console.log(matches ? [...new Set(matches)].slice(0, 10) : 'none');
