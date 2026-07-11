const fs = require('fs');
const cheerio = require('cheerio');
const $ = cheerio.load(fs.readFileSync('asura_home.html'));
$('astro-island').each((i, el) => {
    console.log($(el).attr('component-url'));
    console.log($(el).attr('props')?.slice(0, 150));
});
