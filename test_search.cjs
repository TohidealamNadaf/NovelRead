const fs = require('fs');
async function testSearch() {
    console.log("Testing GET...");
    let res = await fetch("https://freewebnovel.com/search?searchkey=dragon");
    let text = await res.text();
    console.log("GET length:", text.length, "Found:", text.includes("Summon Dragons"));

    console.log("Testing POST...");
    res = await fetch("https://freewebnovel.com/search", {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'searchkey=dragon'
    });
    text = await res.text();
    console.log("POST length:", text.length, "Found:", text.includes("Summon Dragons"));
}
testSearch();
