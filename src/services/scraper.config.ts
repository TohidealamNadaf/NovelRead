/**
 * Scraper Selector Configurations and Extraction Rules
 * Externalizes DOM selectors to ensure resilience against website markup shifts.
 */

export interface ScraperSelectorConfig {
    titleSelectors: string[];
    authorSelectors: string[];
    coverSelectors: string[];
    summarySelectors: string[];
    statusSelectors?: string[];
    chapterListSelectors?: string[];
    contentSelectors: string[];
    unwantedSelectors: string[];
    minContentLength: number;
}

export const NOVELFIRE_SELECTORS: ScraperSelectorConfig = {
    titleSelectors: [
        'h1[itemprop="name"]',
        'h1.novel-title',
        '.novel-info h1',
        'meta[property="og:title"]',
        'h1'
    ],
    authorSelectors: [
        'span[itemprop="author"]',
        '.author a',
        '.novel-info .author a',
        '.novel-info .author',
        '.author'
    ],
    coverSelectors: [
        'meta[property="og:image"]',
        'figure.novel-cover img',
        '.novel-cover img',
        '.cover img',
        '.pic img'
    ],
    summarySelectors: [
        '.summary .content',
        '.summary',
        '.novel-summary',
        '.description',
        'meta[name="description"]'
    ],
    statusSelectors: [
        'strong.ongoing',
        'strong.status',
        '.novel-info .status',
        '.novel-status'
    ],
    chapterListSelectors: [
        '.chapter-list li a',
        'ul.list-chapter li a',
        '#list-chapter a',
        '.chapters a'
    ],
    contentSelectors: [
        '#content',
        '#chapter-container',
        '#chapter-content',
        '.chapter-content',
        '.txt',
        '.reading-content',
        'article',
        '.entry-content'
    ],
    unwantedSelectors: [
        '.ads',
        '.advertisement',
        'script',
        'style',
        'iframe',
        'ins',
        '.social-share',
        '.chapter-nav',
        '.support-author',
        '.donate',
        '#comments',
        '.comments',
        '[id*="ad-"]',
        '[class*="ad-"]',
        '.google-auto-placed'
    ],
    minContentLength: 80
};

export const FREEWEBNOVEL_SELECTORS: ScraperSelectorConfig = {
    titleSelectors: [
        'h1.tit',
        '.m-desc h1',
        'meta[property="og:title"]',
        'h1'
    ],
    authorSelectors: [
        '.m-desc .author a',
        '.m-desc .item:contains("Author") a',
        'a[href*="/authors/"]',
        '.author'
    ],
    coverSelectors: [
        '.m-book1 .pic img',
        'meta[property="og:image"]',
        '.pic img',
        '.book-img img'
    ],
    summarySelectors: [
        '.m-desc .txt',
        '.m-desc .inner',
        '#desc',
        '.description',
        'meta[name="description"]'
    ],
    statusSelectors: [
        '.m-desc .item:contains("Status")',
        '.status'
    ],
    chapterListSelectors: [
        '.ul-list5 li a',
        '.m-newest2 ul li a',
        '#chapters a',
        '.chapter-list a'
    ],
    contentSelectors: [
        '.txt',
        '#chapter-content',
        '#content',
        '.chapter-content',
        '#chapter-container',
        '.reading-content',
        'article'
    ],
    unwantedSelectors: [
        '.ads',
        '.advertisement',
        'script',
        'style',
        'iframe',
        'ins',
        '.social-share',
        '.chapter-nav',
        '.support-author',
        '.donate',
        '#comments',
        '.comments',
        '[id*="ad-"]',
        '[class*="ad-"]',
        '.google-auto-placed'
    ],
    minContentLength: 80
};

export const GENERIC_SELECTORS: ScraperSelectorConfig = {
    titleSelectors: [
        'h1.novel-title',
        'h1.entry-title',
        'h1.title',
        'meta[property="og:title"]',
        'h1'
    ],
    authorSelectors: [
        '.author a',
        '.novel-author',
        'a[rel="author"]',
        '.author'
    ],
    coverSelectors: [
        'meta[property="og:image"]',
        '.novel-cover img',
        '.post-thumbnail img',
        '.thumb img'
    ],
    summarySelectors: [
        '.novel-summary',
        '.entry-content',
        '.description',
        '#synopsis',
        'meta[name="description"]'
    ],
    contentSelectors: [
        '#chapter-content',
        '#content',
        '.chapter-content',
        '.reading-content',
        '.txt',
        '.entry-content',
        'article'
    ],
    unwantedSelectors: [
        '.ads',
        '.advertisement',
        'script',
        'style',
        'iframe',
        'ins',
        '.social-share',
        '.chapter-nav'
    ],
    minContentLength: 80
};
