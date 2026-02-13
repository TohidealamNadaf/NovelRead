const fs = require('fs');

const filePath = 'd:\\NovelReadingApp\\debug_nano_curl.html';
const html = fs.readFileSync(filePath, 'utf8');

// Regex to capture self.__next_f.push([1, "quoted_string"])
// The simple format is self.__next_f.push([1,"..."])
// We need to unescape the JSON string inside.

const regex = /self\.__next_f\.push\(\[1,"(.*?)"\]\)/g;
let match;
let fullData = "";

while ((match = regex.exec(html)) !== null) {
    let content = match[1];
    // Unescape generic JS string escapes
    content = content.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    fullData += content;
}

fs.writeFileSync('d:\\NovelReadingApp\\debug_nano_next_data.txt', fullData, 'utf8');
console.log("Extracted Next.js data to debug_nano_next_data.txt");
