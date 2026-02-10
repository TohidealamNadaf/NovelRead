import { mangaDexService } from './src/services/manhwa/mangaDex.service.ts';

async function testMangaDex() {
    // A known chapter ID from Solo Leveling (e.g. Chapter 200)
    const chapterId = '57393430-8041-436f-998a-7d934f8260a9';

    console.log('Fetching images for MangaDex chapter:', chapterId);
    try {
        const images = await mangaDexService.fetchChapterImages(chapterId);
        console.log(`Found ${images.length} images.`);
        if (images.length > 0) {
            console.log('First image URL:', images[0]);
        }
    } catch (err) {
        console.error('Test failed:', err);
    }
}

testMangaDex();
