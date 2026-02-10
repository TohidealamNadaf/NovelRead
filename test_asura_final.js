import { AsuraScraperService } from './src/services/manhwa/asura.service.ts';

// Mocking fetchHtml slightly for local node environment if needed, 
// but the service handles it. we just need to bypass the native check.
// Since we are running in Node, Capacitor.isNativePlatform() will be false.

async function testFinal() {
    const service = new AsuraScraperService();

    console.log('--- Phase 1: Search ---');
    const searchResults = await service.searchManga('Solo Leveling');
    console.log(`Found ${searchResults.length} results.`);
    if (searchResults.length === 0) {
        console.error('Search failed!');
        return;
    }

    const target = searchResults[0];
    console.log('Selected:', target.title, 'URL:', target.sourceUrl);

    console.log('\n--- Phase 2: Details ---');
    const details = await service.fetchMangaDetails(target.sourceUrl);
    if (!details) {
        console.error('Fetch details failed!');
        return;
    }
    console.log('Title:', details.title);
    console.log('Author:', details.author);
    console.log('Status:', details.status);
    console.log('Chapters found:', details.chapters.length);
    if (details.chapters.length === 0) {
        console.error('No chapters found!');
        return;
    }

    const firstChapter = details.chapters[0];
    console.log('Target Chapter:', firstChapter.title, 'URL:', firstChapter.url);

    console.log('\n--- Phase 3: Chapter Images ---');
    const images = await service.fetchChapterImages(firstChapter.url);
    console.log('Images found:', images.length);
    if (images.length > 0) {
        console.log('First 3 images:');
        console.log(images.slice(0, 3));
    } else {
        console.error('No images found!');
    }
}

testFinal().catch(console.error);
