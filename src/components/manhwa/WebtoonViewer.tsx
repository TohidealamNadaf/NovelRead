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
const isContentPage = (url: string): boolean => {
    // Explicitly exclude GIFs (usually ads or loading spinners)
    if (url.toLowerCase().includes('.gif')) return false;

    const filename = url.split('/').pop() || '';
    const nameWithoutExt = filename.replace(/\.(jpg|jpeg|png|webp|avif|gif)$/i, '');
    const cleanName = nameWithoutExt.replace(/-optimized|_optimized/i, '');
    if (/^\d+$/.test(cleanName)) return true;
    if (/^[a-zA-Z0-9_-]{0,10}[-_]?\d+$/.test(cleanName)) return true;
    return false;
};

/**
 * Sort image URLs: EXTRACT ONLY CONTENT IMAGES.
 * Filters out ads/extras (UUIDs, GIFs) entirely.
 */
const sortByFilenameNumber = (urls: string[]): string[] => {
    const contentPages: string[] = [];

    urls.forEach(url => {
        // Filter out empty URLs and GIFs
        if (!url || url.toLowerCase().includes('.gif')) return;

        // Strict filtering: Only keep images identified as content
        if (isContentPage(url)) {
            contentPages.push(url);
        }
    });

    // Sort content pages purely by number
    contentPages.sort((a, b) => {
        const getNum = (u: string): number => {
            const filename = u.split('/').pop() || '';
            const nameWithoutExt = filename.replace(/\.(jpg|jpeg|png|webp|avif|gif)$/i, '');
            const nums = nameWithoutExt.match(/\d+/g);
            if (nums && nums.length > 0) return parseInt(nums[nums.length - 1], 10);
            return Infinity;
        };
        return getNum(a) - getNum(b);
    });

    return contentPages;
};

const getProxiedUrl = (url: string): string => {
    if (!url) return '';
    // Already proxied or data URL?
    if (url.startsWith('https://wsrv.nl') || url.startsWith('data:')) return url;
    // Use wsrv.nl as a reliable global image proxy
    return `https://wsrv.nl/?url=${encodeURIComponent(url)}`;
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
                    key={index}
                    src={getProxiedUrl(src)}
                    alt={`Page ${index + 1}`}
                    loading="lazy"
                    className="w-full h-auto block"
                    style={{ margin: 0, padding: 0, display: 'block' }}
                    onError={(e) => {
                        // Fallback to original URL if proxy fails
                        const img = e.currentTarget;
                        if (img.src.includes('wsrv.nl')) {
                            img.src = src;
                        }
                    }}
                />
            ))}
        </div>
    );
};
