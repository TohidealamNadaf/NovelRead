const fetch = require('node-fetch'); // wait, built-in fetch in Node 20+
async function run() {
    const res = await fetch('https://freewebnovel.com/martial-world.html');
    const html = await res.text();
    const cheerio = require('cheerio');
    const $ = cheerio.load(html);
    console.log("TIT:", $('h1.tit').text());
    console.log("TXT HTML:", $('.txt').html());
    console.log("NOVEL INFO:", $('.novel-info').html());
    console.log("M-NEWEST2:", $('.m-newest2').html()?.substring(0, 100));
}
run();
