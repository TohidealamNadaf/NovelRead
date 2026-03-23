import { AsuraScraperService } from './src/services/manhwa/asura.service';

const service = new AsuraScraperService();

async function run() {
    console.log('Testing Details...');
    const url = 'https://asurascans.com/comics/solo-max-level-newbie-f6174291';
    const details = await service.fetchMangaDetails(url);
    console.log('Title:', details.title);
    console.log('Chapters found:', details.chapters.length);
    if(details.chapters.length > 0) {
        console.log('First chap:', details.chapters[0].title, details.chapters[0].url);
        
        console.log('\nTesting Images...');
        const images = await service.fetchChapterImages(details.chapters[0].url);
        console.log('Images found:', images.length);
        if(images.length > 0) console.log('First img:', images[0]);
    } else {
        console.log('NO CHAPTERS FOUND');
    }
}
run().catch(console.error);
