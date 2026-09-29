import * as cheerio from 'cheerio';
import fs from 'fs';

async function analyzeHome() {
    const url = 'https://asuracomic.net/';
    try {
        console.log(`Fetching ${url}...`);
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            }
        });

        if (!response.ok) {
            console.error(`HTTP error! status: ${response.status}`);
            return;
        }

        const html = await response.text();
        fs.writeFileSync('asura_home_raw.html', html);
        const $ = cheerio.load(html);

        console.log('--- Home Page Analysis ---');

        // Trending / Top 10
        console.log('\nPotential Trending/Top 10:');
        $('div').each((_, el) => {
            const text = $(el).text();
            if (text.includes('Trending') || text.includes('Top 10') || text.includes('Popular')) {
                const className = $(el).attr('class');
                if (className) console.log(`  Found "${text.slice(0, 20)}..." in div.${className.split(' ').join('.')}`);
            }
        });

        // Latest Updates
        console.log('\nPotential Latest Updates:');
        $('div').each((_, el) => {
            const text = $(el).text();
            if (text.includes('Latest') || text.includes('Update')) {
                const className = $(el).attr('class');
                if (className) console.log(`  Found "${text.slice(0, 20)}..." in div.${className.split(' ').join('.')}`);
            }
        });

        // Search for grids
        console.log('\nPotential Grids:');
        $('.grid').each((_, el) => {
            console.log(`  Found grid with ${$(el).children().length} children. Classes: ${$(el).attr('class')}`);
        });

    } catch (error) {
        console.error('Fetch error:', error);
    }
}

analyzeHome();
