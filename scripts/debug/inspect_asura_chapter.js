import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const filePath = join(__dirname, 'asura_chapter.html');
const html = readFileSync(filePath, 'utf8');

console.log('File size:', html.length);

// 1. Look for all image source URLs
const imgRegex = /src="([^"]+)"/g;
let match;
const images = [];
while ((match = imgRegex.exec(html)) !== null) {
    images.push(match[1]);
}

console.log('Found', images.length, 'img src attributes.');
// Show first 10
console.log('First 10 images:', images.slice(0, 10));

// 2. Look for patterns in self.__next_f.push
// The chapter images are likely in a JSON string inside these pushes.
// We'll look for "http...webp" or "http...jpg" inside the script parts.

// Regex for all URLs in the file.
const urlRegex = /https?:\/\/[^"'\s\\]+\.(?:jpg|jpeg|png|webp|avif)/gi;
let urlMatch;
const allUrls = [];
while ((urlMatch = urlRegex.exec(html)) !== null) {
    allUrls.push(urlMatch[0]);
}

console.log('Found', allUrls.length, 'total image URLs in file.');

// Filter for potential chapter images. usually they are numeric or have a specific pattern.
// Asura images often look like: https://gg.asuracomic.net/storage/media/123/conversions/....webp
// Filter for potential chapter images.
// Asura images often look like: https://gg.asuracomic.net/storage/media/123/conversions/....webp
// We want to exclude "thumb" and "conversions" if possible, or see if there are other images.
const chapterImages = allUrls.filter(u =>
    u.includes('gg.asuracomic.net') &&
    !u.includes('logo') &&
    !u.includes('icon') &&
    !u.includes('thumb') &&
    !u.includes('avatar')
);

console.log('Potential chapter images (excluding thumbs):', chapterImages.length);
// Save to file
import { writeFileSync } from 'fs';
const outPath = join(__dirname, 'asura_images.json');
writeFileSync(outPath, JSON.stringify(chapterImages, null, 2));
console.log('Saved to asura_images.json');


