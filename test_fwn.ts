import { FreeWebNovelScraper } from './src/services/freewebnovel.scraper';

async function main() {
    const scraper = new FreeWebNovelScraper();
    const data = await scraper.syncDiscoverData();
    console.log(JSON.stringify({
        ranking: data.ranking.length,
        latest: data.latest.length,
        completed: data.completed.length,
        recentlyAdded: data.recentlyAdded.length,
        recommended: data.recommended.length
    }, null, 2));
}

main().catch(console.error);
