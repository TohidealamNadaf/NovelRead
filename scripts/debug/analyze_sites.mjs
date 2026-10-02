const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';

async function testRedirects() {
  console.log('=== NovelFire Redirect Tests ===');
  
  // Test novel page with redirect: false
  const urls = [
    'https://novelfire.net/book/shadow-slave/chapter-1',
    'https://novelfire.net/book/shadow-slave/chapter-2',
    'https://novelfire.net/book/reverend-insanity/chapter-1',
    'https://novelfire.net/book/reverend-insanity/chapter-2',
    'https://novelfire.net/book/shadow-slave',
    'https://novelfire.net/book/shadow-slave/chapters',
  ];
  
  for (const url of urls) {
    try {
      const r = await fetch(url, { 
        headers: { 'User-Agent': ua },
        redirect: 'manual'  // Don't follow redirects
      });
      console.log(`${url.replace('https://novelfire.net', '')}`);
      console.log(`  status: ${r.status}`);
      if (r.headers.get('location')) {
        console.log(`  redirect to: ${r.headers.get('location')}`);
      }
      if (r.status >= 200 && r.status < 300) {
        const text = await r.text();
        console.log(`  len: ${text.length}`);
        // Check if there's a meta refresh or JS redirect
        const metaRefresh = text.match(/meta[^>]*http-equiv="refresh"[^>]*content="[^"]*url=([^"]+)"/i);
        if (metaRefresh) console.log(`  meta-refresh to: ${metaRefresh[1]}`);
        const jsRedirect = text.match(/window\.location\s*=\s*["']([^"']+)["']/);
        if (jsRedirect) console.log(`  JS redirect to: ${jsRedirect[1]}`);
        const jsReplace = text.match(/location\.replace\s*\(\s*["']([^"']+)["']\s*\)/);
        if (jsReplace) console.log(`  location.replace to: ${jsReplace[1]}`);
        // Check for readnovel.site references
        if (text.includes('readnovel.site')) {
          console.log(`  !! Contains readnovel.site reference`);
          // Find the context
          const idx = text.indexOf('readnovel.site');
          console.log(`  context: ...${text.slice(Math.max(0,idx-100), idx+100)}...`);
        }
      }
    } catch (e) {
      console.log(`  ERROR: ${e.message}`);
    }
  }
  
  // Test readnovel.site directly
  console.log('\n=== readnovel.site Direct Tests ===');
  try {
    const r = await fetch('https://readnovel.site/', { 
      headers: { 'User-Agent': ua },
      redirect: 'manual'
    });
    console.log(`readnovel.site/ status: ${r.status}`);
    if (r.headers.get('location')) console.log(`  redirect: ${r.headers.get('location')}`);
  } catch (e) {
    console.log(`readnovel.site ERROR: ${e.message}`);
  }
  
  try {
    const r = await fetch('https://readnovel.site/novel/reverend-insanity/chapter-1', { 
      headers: { 'User-Agent': ua },
      redirect: 'manual'
    });
    console.log(`readnovel.site/novel/... status: ${r.status}`);
    if (r.headers.get('location')) console.log(`  redirect: ${r.headers.get('location')}`);
    if (r.status >= 200 && r.status < 300) {
      const t = await r.text();
      console.log(`  len: ${t.length}, title match:`, t.match(/<title>([^<]+)<\/title>/)?.[1]?.slice(0,60));
    }
  } catch (e) {
    console.log(`readnovel.site/novel ERROR: ${e.message}`);
  }
}

testRedirects().catch(console.error);
