import { CapacitorHttp } from '@capacitor/core';

export abstract class BaseScraper {
    private PROXIES = [
        'https://api.codetabs.com/v1/proxy?quest=',
        'https://corsproxy.io/?',
        'https://api.allorigins.win/raw?url='
    ];

    // Retry configuration for Cloudflare-blocked requests is handled externally or not used anymore

    public getProxies(url?: string): string[] {
        // Return an empty string first to try direct connection, then fallbacks
        // The vite proxy in dev server handles CORS natively when no prefix is used.
        if (url) {
            // We use the default proxy list for all hosts now to ensure native (Capacitor) direct connections are attempted first.
        }
        return ['', ...this.PROXIES];
    }

    /**
     * Races all proxies (including direct connection) simultaneously.
     * Reduces the overall timeout to 5000ms.
     * Resolves with the first successful HTML response, or throws if all fail.
     */
    public async fetchHtmlWithProxies(url: string): Promise<string> {
        if (!url) throw new Error("Invalid URL");

        const proxies = this.getProxies(url);

        for (const proxyPrefix of proxies) {
            try {
                const html = await this.fetchHtml(url, proxyPrefix, 8000);
                if (html) return html;
            } catch (error) {
                console.warn(`[BaseScraper] Proxy attempt failed for ${url} via ${proxyPrefix || 'direct'}`, error);
            }
        }

        throw new Error(`All proxies failed for ${url}`);
    }

    public async fetchHtml(url: string, proxyPrefix: string = '', timeoutMs: number = 10000): Promise<string | null> {
        if (!url) return null;

        try {
            const separator = url.includes('?') ? '&' : '?';
            // Only cache-bust the direct connection. Proxies should use their own cache layer.
            const bustedUrl = proxyPrefix === '' ? `${url}${separator}_t=${Date.now()}` : url;
            const finalUrl = proxyPrefix ? `${proxyPrefix}${encodeURIComponent(bustedUrl)}` : bustedUrl;

            const isCapacitor = typeof window !== 'undefined' && (window as any).Capacitor && (window as any).Capacitor.isNativePlatform();

            if (isCapacitor) {
                const response = await CapacitorHttp.get({
                    url: finalUrl,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.5',
                        'Cache-Control': 'no-cache',
                        'Pragma': 'no-cache'
                    },
                    responseType: 'text',
                    connectTimeout: Math.min(8000, timeoutMs),
                    readTimeout: timeoutMs
                });

                if (response.status >= 200 && response.status < 300) {
                    return typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
                }
            } else {
                const fetchUrl = proxyPrefix
                    ? finalUrl
                    : `/api/proxy?url=${encodeURIComponent(url)}`;

                const isLocalProxy = fetchUrl.startsWith('/api/proxy');
                const effectiveTimeout = isLocalProxy ? 35000 : timeoutMs;

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), effectiveTimeout);

                try {
                    const response = await fetch(fetchUrl, {
                        cache: 'no-cache',
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                            'Accept': 'text/html',
                            'Cache-Control': 'no-cache',
                            'Pragma': 'no-cache'
                        },
                        signal: controller.signal
                    });

                    clearTimeout(timeoutId);

                    if (response.ok) {
                        const html = await response.text();
                        if (this.isChallengePage(html)) return null;
                        return html;
                    }
                } catch (fetchErr) {
                    clearTimeout(timeoutId);
                    if ((fetchErr as any).name !== 'AbortError' || !isLocalProxy) {
                        throw fetchErr;
                    }
                }
            }
            return null;
        } catch (error) {
            console.warn(`[BaseScraper] fetchHtml failed for ${url} via ${proxyPrefix || 'direct'}`, error);
            return null;
        }
    }

    protected isChallengePage(html: string): boolean {
        if (!html || html.length < 500) return true;

        const challengeIndicators = [
            'cf-browser-verification',
            'Just a moment',
            'Verifying you are human',
            'cf-challenge',
            'Attention Required',
            'Access denied',
            '403 Forbidden',
            'blocked by Cloudflare'
        ];

        return challengeIndicators.some(indicator => html.includes(indicator));
    }

    public resolveUrl(baseUrl: string, href: string): string {
        if (!href) return '';
        if (href.startsWith('http')) return href;
        if (href.startsWith('//')) return `https:${href}`;
        try {
            const base = new URL(baseUrl);
            return new URL(href, base).href;
        } catch {
            return href;
        }
    }

    public cleanChapterTitle(raw: string): string {
        if (!raw) return '';
        let cleaned = raw.trim();
        cleaned = cleaned.replace(/^\d+[\s\.\-]+(Chapter\b)/gi, '$1');
        const timestampRegex = /(?<=\D|^)\d{1,2}\s*(minute|hour|day|week|month|year)s?\s*ago/gi;
        cleaned = cleaned.replace(timestampRegex, '');
        cleaned = cleaned.replace(/(NEW|HOT|FREE|UPDATED)$/gi, '');
        cleaned = cleaned.replace(/\s+/g, ' ').trim();
        return cleaned;
    }

    public cleanSummary(text: string): string {
        if (!text) return '';
        let cleaned = text
            .replace(/\s*(show\s*more|read\s*more|see\s*more|view\s*more|show\s*less|read\s*less|see\s*less|view\s*less|\.\.\.\s*more|\.\.\.\s*less|\.{3,}\s*$)\s*$/gi, '')
            .replace(/\s*(show\s*more|read\s*more|see\s*more|view\s*more)\s*/gi, '')
            .trim();
        cleaned = cleaned.replace(/\s*\.{3,}\s*$/, '').trim();
        return cleaned;
    }

    public isValidChapterTitle(title: string): boolean {
        if (!title) return false;
        if (title.length < 5) return false;
        if (/\b\d+\s*(minute|hour|day|week|month)s?\s*ago\b/gi.test(title)) return false;
        if (!/[a-zA-Z]/.test(title)) return false;
        if (/^\d+$/.test(title.replace(/\s/g, ''))) return false;
        return true;
    }

    public enhanceContent(rawHtml: string): string {
        if (!rawHtml) return '';

        let cleaned = rawHtml
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
            .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
            .replace(/<ins\b[^<]*(?:(?!<\/ins>)<[^<]*)*<\/ins>/gi, '')
            .replace(/<div[^>]*class="[^"]*(ads|advertisement|promo|sponsor)[^"]*"[^>]*>.*?<\/div>/gi, '')
            .replace(/<!--[\s\S]*?-->/g, '');

        const wrapper = document.createElement('div');
        wrapper.innerHTML = cleaned;

        const removeSelectors = [
            '.ads', '.advertisement', '.social-share', '.chapter-nav',
            '.support-author', '.donate', '#comments', '.comments',
            '[id*="ad-"]', '[class*="ad-"]', '.google-auto-placed'
        ];

        removeSelectors.forEach(sel => {
            const elements = wrapper.querySelectorAll(sel);
            elements.forEach(el => el.remove());
        });

        const elements = wrapper.querySelectorAll('*');
        elements.forEach(el => {
            el.removeAttribute('style');
            el.removeAttribute('class');
            el.removeAttribute('id');
        });

        wrapper.innerHTML = wrapper.innerHTML
            .replace(/(&nbsp;){2,}/g, '&nbsp;')
            .replace(/(<br\s*\/?>\s*){3,}/gi, '<br><br>')
            .replace(/<p>\s*<\/p>/gi, '');

        return wrapper.innerHTML;
    }

    public async fetchHtmlPost(url: string, formData: Record<string, string>, timeoutMs: number = 10000): Promise<string | null> {
        if (!url) return null;

        const body = new URLSearchParams(formData).toString();
        const isCapacitor = typeof window !== 'undefined' && (window as any).Capacitor && (window as any).Capacitor.isNativePlatform();

        try {
            if (isCapacitor) {
                const response = await CapacitorHttp.post({
                    url,
                    data: body,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    },
                    responseType: 'text',
                    connectTimeout: Math.min(8000, timeoutMs),
                    readTimeout: timeoutMs
                });

                if (response.status >= 200 && response.status < 300) {
                    return typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
                }
                return null;
            } else {
                // Web: route through the local vite dev proxy only — external CORS
                // proxies don't reliably forward POST bodies for form submissions.
                const fetchUrl = `/api/proxy?url=${encodeURIComponent(url)}`;
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

                try {
                    const response = await fetch(fetchUrl, {
                        method: 'POST',
                        cache: 'no-cache',
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded',
                            'Accept': 'text/html',
                        },
                        body,
                        signal: controller.signal
                    });

                    clearTimeout(timeoutId);
                    if (response.ok) {
                        return await response.text();
                    }
                    return null;
                } catch (fetchErr) {
                    clearTimeout(timeoutId);
                    throw fetchErr;
                }
            }
        } catch (error) {
            console.warn(`[BaseScraper] fetchHtmlPost failed for ${url}`, error);
            return null;
        }
    }
}
