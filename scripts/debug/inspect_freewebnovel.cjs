const fs = require('fs');

async function fetchHtml() {
  const res = await fetch('https://freewebnovel.com/');
  const text = await res.text();
  fs.writeFileSync('freewebnovel.html', text);
  
  const novelRes = await fetch('https://freewebnovel.com/novel/others-summon-dragons-i-summon-legendary-knights');
  const novelText = await novelRes.text();
  fs.writeFileSync('freewebnovel_novel.html', novelText);
  
  const chapterRes = await fetch('https://freewebnovel.com/novel/others-summon-dragons-i-summon-legendary-knights/chapter-1');
  const chapterText = await chapterRes.text();
  fs.writeFileSync('freewebnovel_chapter.html', chapterText);
  
  console.log("Done");
}

fetchHtml();
