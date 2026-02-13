import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

interface WebtoonViewerProps {
    content?: string; // HTML content or just parsing logic
    images?: string[]; // If we pre-parse (preferred)
    isLoading?: boolean;
}

/**
 * Check if an image is likely a chapter page (content) or an ad/extra.
 */
/**
 * Extract page number for sorting.
 * Handles digits and ULID patterns.
 */
const extractPageNumber = (url: string): number => {
    const filename = url.split('/').pop() || '';
    const nameWithoutExt = filename.replace(/\.(jpg|jpeg|png|webp|avif|gif)$/i, '');
    const cleanName = nameWithoutExt.replace(/-optimized|_optimized/i, '');

    // Try to find numbers
    const allNumbers = cleanName.match(/\d+/g);
    if (allNumbers && allNumbers.length > 0) {
        return parseInt(allNumbers[allNumbers.length - 1], 10);
    }
    return -1;
};

/**
 * Check if an image is content (not ad).
 * Supports Numeric, Prefix-Numeric, ULID, and Hex patterns.
 */
const isContentPage = (url: string): boolean => {
    if (!url || url.toLowerCase().includes('.gif')) return false;

    const filename = url.split('/').pop() || '';
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

    // 3. Strict ULID (Asura)
    if (/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(cleanName)) return true;

    return false;
};

/**
 * Sort image URLs: EXTRACT ONLY CONTENT IMAGES.
 * Filters out ads/extras (UUIDs, GIFs) entirely.
 */
const sortByFilenameNumber = (urls: string[]): string[] => {
    const contentPages = urls.filter(url => url && !url.toLowerCase().includes('.gif') && isContentPage(url));

    contentPages.sort((a, b) => {
        const numA = extractPageNumber(a);
        const numB = extractPageNumber(b);

        if (numA !== -1 && numB !== -1) {
            const diff = numA - numB;
            if (diff !== 0) return diff;
        }

        const getCleanName = (u: string) => {
            const f = u.split('/').pop() || '';
            return f.replace(/\.(jpg|jpeg|png|webp|avif|gif)$/i, '').replace(/-optimized|_optimized/i, '');
        };
        return getCleanName(a).localeCompare(getCleanName(b));
    });

    return contentPages;
};

const getProxiedUrl = (url: string): string => {
    if (!url) return '';
    if (url.startsWith('https://wsrv.nl') || url.startsWith('data:')) return url;
    // Optimization: WebP, Q75, W1200, Interlaced
    return `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=1200&q=75&output=webp&il`;
};

export const WebtoonViewer: React.FC<WebtoonViewerProps> = ({ content, images: propImages, isLoading }) => {
    const [images, setImages] = useState<string[]>([]);

    useEffect(() => {
        if (propImages && propImages.length > 0) {
            setImages(sortByFilenameNumber(propImages));
        } else if (content) {
            // Parse images from HTML string
            const parser = new DOMParser();
            const doc = parser.parseFromString(content, 'text/html');
            const imgTags = Array.from(doc.getElementsByTagName('img'));
            const imageUrls = imgTags
                .map(img => img.getAttribute('src') || img.getAttribute('data-src'))
                .filter((src): src is string => !!src);
            setImages(sortByFilenameNumber(imageUrls));
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
        <div className="flex flex-col w-full bg-black">
            {images.map((src, index) => (
                <img
                    key={`${src}-${index}`}
                    src={getProxiedUrl(src)}
                    alt={`Page ${index + 1}`}
                    loading={index < 3 ? "eager" : "lazy"}
                    decoding="async"
                    className="w-full h-auto block"
                    style={{ margin: 0, padding: 0, display: 'block', minHeight: '300px' }}
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
            ))}
        </div>
    );
};
