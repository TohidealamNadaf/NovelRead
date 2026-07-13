import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { ReaderImageSettings } from '../../pages/ManhwaReader';

interface WebtoonViewerProps {
    content?: string; // HTML content or just parsing logic
    images?: string[]; // If we pre-parse (preferred)
    isLoading?: boolean;
    imageSettings?: ReaderImageSettings;
}

/**
 * Check if an image is likely a chapter page (content) or an ad/extra.
 */
/**
 * Extract page number for sorting.
 * Handles digits and ULID patterns.
 */

/**
 * Check if an image is content (not ad).
 * Supports Numeric, Prefix-Numeric, ULID, and Hex patterns.
 */
const isContentPage = (url: string): boolean => {
    if (!url || url.toLowerCase().includes('.gif')) return false;

    // Strip query parameters before extracting filename — some CDN URLs
    // include cache-busting suffixes like ?v=123 that would corrupt the
    // filename match (e.g. "a1cdd1.webp?v=1" → filename becomes
    // "a1cdd1.webp?v=1" instead of "a1cdd1.webp").
    const urlWithoutQuery = url.split('?')[0];
    const filename = urlWithoutQuery.split('/').pop() || '';
    const nameWithoutExt = filename.replace(/\.(jpg|jpeg|png|webp|avif|gif)$/i, '');
    const cleanName = nameWithoutExt.replace(/-optimized|_optimized/i, '');
    const lowerName = cleanName.toLowerCase();

    // Blacklist common ad/promo keywords
    const blacklist = ['logo', 'banner', 'discord', 'promo', 'ad-', '_ad', 'patreon', 'ko-fi', 'credit', 'recruit', 'intro', 'outro'];
    if (blacklist.some(term => lowerName.includes(term))) return false;

    // 1. Numeric
    if (/^\d+$/.test(cleanName)) return true;

    // 2. Prefix + Numeric (Restrictive)
    if (/^(page|img|image|p|i)?[-_]?\d+$/i.test(cleanName)) return true;

    // 3. ULID (Asura's newer format) -> 26 chars, starts with 0-7
    if (/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(cleanName)) return true;

    // 4. Short alphanumeric hex hashes (e.g. "a1cdd1", "f4b2e9a0") —
    // used by Tomb Raider King and other series on Asura's CDN.
    // This pattern was already in asura.service.ts but was missing here,
    // causing images to pass the service-level filter and then be silently
    // discarded by the viewer's own filterContentImages call.
    if (/^[a-f0-9]{4,16}$/i.test(cleanName)) return true;

    return false;
};

/**
 * Filter image URLs: EXTRACT ONLY CONTENT IMAGES.
 * Filters out ads/extras (UUIDs, GIFs) entirely.
 * DOES NOT RE-SORT. Trusts source order.
 */
const filterContentImages = (urls: string[]): string[] => {
    return urls.filter(url => url && !url.toLowerCase().includes('.gif') && isContentPage(url));
};

const getProxiedUrl = (url: string): string => {
    if (!url) return '';
    if (url.startsWith('https://wsrv.nl') || url.startsWith('data:')) return url;
    // Optimization: WebP, Q75, W1200, Interlaced
    return `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=1200&q=75&output=webp&il`;
};

export const WebtoonViewer: React.FC<WebtoonViewerProps> = ({ content, images: propImages, isLoading, imageSettings }) => {
    const [images, setImages] = useState<string[]>([]);

    useEffect(() => {
        if (propImages && propImages.length > 0) {
            setImages(filterContentImages(propImages));
        } else if (content) {
            // Parse images from HTML string
            const parser = new DOMParser();
            const doc = parser.parseFromString(content, 'text/html');
            const imgTags = Array.from(doc.getElementsByTagName('img'));
            const imageUrls = imgTags
                .map(img => img.getAttribute('src') || img.getAttribute('data-src'))
                .filter((src): src is string => !!src);
            setImages(filterContentImages(imageUrls));
        }
    }, [content, propImages]);

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] text-slate-400">
                <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
                <p>Loading Chapter...</p>
            </div>
        );
    }

    if (images.length === 0 && !isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] text-slate-500">
                <p>No images found in this chapter.</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col w-full bg-black" style={{ filter: imageSettings?.grayscale ? 'grayscale(100%)' : undefined }}>
            {images.map((src, index) => {
                const imgStyle: React.CSSProperties = { margin: '0 auto', padding: 0, display: 'block', minHeight: '300px' };

                if (imageSettings?.limitMaxWidth) {
                    imgStyle.maxWidth = '800px';
                }
                
                if (imageSettings?.limitMaxHeight) {
                    imgStyle.maxHeight = '1200px';
                    imgStyle.objectFit = 'contain';
                } else if (imageSettings?.fitHeight) {
                    imgStyle.maxHeight = '100vh';
                    imgStyle.objectFit = 'contain';
                }

                if (imageSettings?.fitWidth) {
                    if (imageSettings.stretchSmallImages) {
                        imgStyle.width = '100%';
                    } else {
                        imgStyle.width = 'auto';
                        imgStyle.maxWidth = imgStyle.maxWidth || '100%';
                    }
                }

                return (
                <img
                    key={`${src}-${index}`}
                    src={getProxiedUrl(src)}
                    alt={`Page ${index + 1}`}
                    loading={index < 3 ? "eager" : "lazy"}
                    decoding="async"
                    className="block"
                    style={imgStyle}
                    onError={(e) => {
                        const img = e.currentTarget;
                        if (img.src.includes('wsrv.nl')) {
                            img.src = src;
                        } else {
                            img.style.display = 'none';
                        }
                    }}
                    onLoad={(e) => {
                        const img = e.currentTarget;
                        const w = img.naturalWidth;
                        const h = img.naturalHeight;

                        // Heuristic 1: Wide Banner (e.g. 728x90, 800x200) - Limit height to avoid hiding wide panoramic panels
                        const isBanner = w > h * 1.5 && h < 600;

                        // Heuristic 2: Small/Medium Square or Landscape (e.g. 300x250, 500x500, 800x600 Discord invites)
                        // Allow large double spreads (h > 800)
                        const isSquareOrLandscapeAd = w >= h && h < 800;

                        if (isBanner || isSquareOrLandscapeAd) {
                            console.log(`[WebtoonViewer] Hiding ad-like image: ${src} (${w}x${h})`);
                            img.style.display = 'none';
                        }
                    }}
                />
            )})}
        </div>
    );
};
