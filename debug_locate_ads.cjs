const fs = require('fs');

const filePath = 'd:\\NovelReadingApp\\debug_nano_curl.html';
const problematicUrls = [
    '403508/conversions/08-optimized.webp',
    '403505/conversions/05-optimized.webp',
    '403501/conversions/01-optimized.webp'
];

try {
    const html = fs.readFileSync(filePath, 'utf8');
    console.log(`Loaded HTML: ${html.length} chars`);

    problematicUrls.forEach(urlPart => {
        console.log(`\n--- Searching for: ${urlPart} ---`);
        let index = html.indexOf(urlPart);
        while (index !== -1) {
            // Get surrounding context
            const start = Math.max(0, index - 300);
            const end = Math.min(html.length, index + 300);
            const snippet = html.substring(start, end);

            console.log(`Found at index ${index}:`);
            console.log(snippet.replace(/\n/g, ' ')); // flatten for readability

            // Find next occurrence
            index = html.indexOf(urlPart, index + 1);
        }
    });

} catch (e) {
    console.error("Error:", e.message);
}
