const fs = require('fs');
const html = fs.readFileSync('nb_test.html', 'utf8');
const scripts = html.match(/<script[\s\S]*?<\/script>/gi) || [];
for (const s of scripts) {
    if (s.includes('ajax') || s.includes('chapter') || s.includes('novel')) {
        console.log('--- SCRIPT ---');
        console.log(s.substring(0, 300));
    }
}
