// Need to use ts-node or similar, so I'll just write a script that runs via npx tsx
import { MangaFireHtmlScraper } from './src/services/manhwa/mangafire.service';

(async () => {
    const scraper = new MangaFireHtmlScraper();
    console.log('Searching MangaFire for "naruto"...');
    const results = await scraper.searchManga('naruto');
    console.log(`Found ${results.length} results.`);
    console.log(results.slice(0, 3));
})();
