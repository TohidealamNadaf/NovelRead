const cheerio = require('cheerio');
const axios = require('axios');

async function test() {
    const url = 'https://freewebnovel.com/martial-god-asura.html'; // known long novel
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);
    
    console.log("Chapters found in .m-newest2 ul li a: " + $('.m-newest2 ul li a').length);
    
    // Check if there's a select tag for chapters
    console.log("Select elements:", $('select').length);
    $('select option').each((i, el) => {
        if(i < 5 || i > $('select option').length - 5) {
            console.log("Option:", $(el).attr('value'), $(el).text());
        }
    });

    console.log("Pagination links:");
    $('select').parent().html() && console.log($('select').parent().html().substring(0, 500));
}
test().catch(console.error);
