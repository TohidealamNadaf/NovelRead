(async () => {
  const fs = require('fs');
  try {
      const html = await (await fetch('https://corsproxy.io/?' + encodeURIComponent('https://asurascans.com/'))).text();
      fs.writeFileSync('asura_home.html', html);

      const links = [...html.matchAll(/href="([^"]+)"/g)].map(m => m[1]);
      console.log("Comics links:", [...new Set(links.filter(l => l.includes('/comics/') || l.includes('/series/') || l.includes('/manga/')))].slice(0, 10));

      const searchHtml = await (await fetch('https://corsproxy.io/?' + encodeURIComponent('https://asurascans.com/?s=solo+leveling'))).text();
      fs.writeFileSync('asura_search.html', searchHtml);
      const searchLinks = [...searchHtml.matchAll(/href="([^"]+)"/g)].map(m => m[1]);
      console.log("Search solo leveling links:", [...new Set(searchLinks.filter(l => l.includes('/comics/') || l.includes('/series/') || l.includes('/manga/')))].slice(0, 5));

      const chapHtml = await (await fetch('https://corsproxy.io/?' + encodeURIComponent('https://asurascans.com/comics/solo-max-level-newbie/chapter-1'))).text();
      fs.writeFileSync('asura_chap.html', chapHtml);
      const imgs = [...chapHtml.matchAll(/<img[^>]+src="([^"]+)"/g)].map(m => m[1]);
      console.log("Chapter 1 img sources:", imgs.filter(i => !i.includes('logo') && !i.includes('avatar')).slice(0, 5));
  } catch(e) {
      console.error(e);
  }
})();
