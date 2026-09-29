export function deriveNovelSourceUrl(rawUrl: string): string {
    if (!rawUrl) return '';
    let url = rawUrl;
    try {
        if (url.includes('%')) url = decodeURIComponent(url);
    } catch {
        // Ignore URI decode error and proceed with raw URL
    }

    if (url.includes('freewebnovel.com')) {
        url = url.replace(/\/chapter[_-]?\d+.*\.html$/i, '.html').replace(/\/chapter[_-]?\d+.*$/i, '');
    } else if (url.includes('novelfire.net')) {
        url = url.replace(/\/chapter[_-]?\d+.*$/i, '').replace(/\/chapters\/?$/i, '');
    } else {
        url = url.replace(/\/chapter[_-]?\d+.*$/i, '').replace(/\/ch[_-]?\d+.*$/i, '');
    }
    return url.replace(/\/$/, '');
}
