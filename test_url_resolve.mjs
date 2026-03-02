function resolveUrl(baseUrl, href) {
    if (!href) return '';
    if (href.startsWith('http')) return href;
    if (href.startsWith('//')) return `https:${href}`;

    try {
        const base = new URL(baseUrl);
        if (href.startsWith('/')) {
            return `${base.origin}${href}`;
        }
        return `${base.origin}${base.pathname.endsWith('/') ? base.pathname : base.pathname + '/'}${href}`;
    } catch {
        return href;
    }
}

const baseUrl = 'https://novelbin.me/ajax/chapter-archive?novelId=dimensional-keeper';
const link1 = '/novel-book/dimensional-keeper/chapter-1';
const link2 = 'chapter-1';

console.log('Resolving relative absolute:');
console.log(resolveUrl(baseUrl, link1));

console.log('Resolving purely relative:');
console.log(resolveUrl(baseUrl, link2));
