import { NovelFireScraper } from './src/services/novelfire.scraper.js';

async function test() {
    const scraper = new NovelFireScraper();
    console.log("Fetching Ranking...");
    const ranking = await scraper.fetchRanking(1);
    console.log("Ranking:", ranking.length, "items");
    if (ranking.length > 0) console.log(ranking[0]);
    
    console.log("Fetching Latest...");
    const latest = await scraper.fetchLatest(1);
    console.log("Latest:", latest.length, "items");
    
    console.log("Fetching Recommended...");
    const recommended = await scraper.fetchSection('https://novelfire.net/filter');
    console.log("Recommended:", recommended.length, "items");
}

test().catch(console.error);
