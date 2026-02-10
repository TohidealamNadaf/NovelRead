import * as cheerio from 'cheerio';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const filePath = join(__dirname, 'asura_chapter.html');
const html = readFileSync(filePath, 'utf8');

const $ = cheerio.load(html);


console.log('Testing selectors...');

// 1. Try generic img
const allImgs = $('img');
console.log('Total imgs:', allImgs.length);

// 2. Try looking for the container.
// Usually "#readerarea", ".reading-content", "div.w-full.mx-auto"
const readerArea = $('#readerarea img');
console.log('#readerarea imgs:', readerArea.length);

const wFull = $('div.w-full.mx-auto img');
console.log('div.w-full.mx-auto imgs:', wFull.length);

// 3. Look for images with "optimized" in src
let optimizedCount = 0;
allImgs.each((i, el) => {
    const src = $(el).attr('src');
    if (src && src.includes('optimized')) {
        optimizedCount++;
        if (i < 5) console.log('Optimized img src:', src);
    }
});
console.log('Optimized imgs count:', optimizedCount);

// 4. Print parent classes of optimized images
const firstOpt = allImgs.filter((i, el) => $(el).attr('src')?.includes('optimized')).first();
if (firstOpt.length) {
    console.log('Parent of first optimized img:', firstOpt.parent().attr('class'));
    console.log('Grandparent:', firstOpt.parent().parent().attr('class'));
    console.log('Great-Grandparent:', firstOpt.parent().parent().parent().attr('class'));
}
