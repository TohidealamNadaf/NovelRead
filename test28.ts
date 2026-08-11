import { MangaFireHtmlScraper } from './src/services/manhwa/mangafire.service.js';
const scraper = new MangaFireHtmlScraper();
scraper.fetchChapterImages('https://mangafire.to/title/ro8ro-all-class-awakening-god-slayer/chapter/9348523').then(images => {
    console.log('Images length:', images?.length);
}).catch(console.error);
