import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { ReaderImageSettings } from '../../pages/ManhwaReader';
import { Capacitor } from '@capacitor/core';

const IS_NATIVE = Capacitor.isNativePlatform();

interface WebtoonViewerProps {
    content?: string; // HTML content or just parsing logic
    images?: string[]; // If we pre-parse (preferred)
    isLoading?: boolean;
    imageSettings?: ReaderImageSettings;
}

interface ImagePage {
    src: string;
    width: number;
    height: number;
    trusted?: boolean;
}

const isContentPage = (url: string): boolean => {
    if (!url || url.toLowerCase().includes('.gif')) return false;

    if (/\/mf\/[a-f0-9]{20,}\/h\/p\.(jpg|jpeg|png|webp|avif)(\?.*)?$/i.test(url)) {
        return true;
    }

    const urlWithoutQuery = url.split('?')[0];
    const filename = urlWithoutQuery.split('/').pop() || '';
    const nameWithoutExt = filename.replace(/\.(jpg|jpeg|png|webp|avif|gif)$/i, '');
    const cleanName = nameWithoutExt.replace(/-optimized|_optimized/i, '');
    const lowerName = cleanName.toLowerCase();

    const blacklist = ['logo', 'banner', 'discord', 'promo', 'ad-', '_ad', 'patreon', 'ko-fi', 'credit', 'recruit', 'intro', 'outro'];
    if (blacklist.some(term => lowerName.includes(term))) return false;

    if (/^\d+$/.test(cleanName)) return true;
    if (/^(page|img|image|p|i)?[-_]?\d+$/i.test(cleanName)) return true;
    if (/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(cleanName)) return true;
    if (/^[a-f0-9]{4,32}$/i.test(cleanName)) return true;

    return false;
};

const filterContentImages = (pages: ImagePage[]): ImagePage[] => {
    return pages.filter(page => page.src && !page.src.toLowerCase().includes('.gif') && isContentPage(page.src));
};

const getProxiedUrl = (url: string, cacheBustTimestamp?: number): string => {
    if (!url) return '';
    if (url.startsWith('https://wsrv.nl') || url.startsWith('data:')) return url;
    
    const ts = cacheBustTimestamp ? cacheBustTimestamp : -1;
    return `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=1000&output=webp&q=82&il&n=${ts}`;
};

export const WebtoonViewer: React.FC<WebtoonViewerProps> = ({ content, images: propImages, isLoading, imageSettings }) => {
    const [images, setImages] = useState<ImagePage[]>([]);
    const [retries, setRetries] = useState<Record<string, number>>({});

    useEffect(() => {
        if (propImages && propImages.length > 0) {
            const pages = propImages.map(src => ({ src, width: 0, height: 0, trusted: false }));
            setImages(filterContentImages(pages));
        } else if (content) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(content, 'text/html');
            const imgTags = Array.from(doc.getElementsByTagName('img'));
            const pages: ImagePage[] = imgTags.map(img => {
                const src = img.getAttribute('src') || img.getAttribute('data-src') || '';
                const w = parseInt(img.getAttribute('data-w') || '0', 10);
                const h = parseInt(img.getAttribute('data-h') || '0', 10);
                const trusted = img.getAttribute('data-trusted') === 'true';
                return { src, width: w, height: h, trusted };
            }).filter(p => !!p.src);
            
            setImages(filterContentImages(pages));
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
            {images.map((page, index) => {
                const imgStyle: React.CSSProperties = { margin: '0 auto', padding: 0, display: 'block', objectFit: 'contain', width: '100%' };

                if (imageSettings?.limitMaxWidth) {
                    imgStyle.maxWidth = '800px';
                }
                
                if (imageSettings?.limitMaxHeight) {
                    imgStyle.maxHeight = '1200px';
                } else if (imageSettings?.fitHeight) {
                    imgStyle.maxHeight = '100vh';
                }

                if (imageSettings?.fitWidth) {
                    if (imageSettings.stretchSmallImages) {
                        imgStyle.width = '100%';
                    } else {
                        imgStyle.width = 'auto';
                        imgStyle.maxWidth = imgStyle.maxWidth || '100%';
                    }
                }

                const retryCount = retries[page.src] || 0;
                
                let currentSrc = IS_NATIVE ? page.src : getProxiedUrl(page.src);
                if (retryCount === 1) currentSrc = IS_NATIVE ? getProxiedUrl(page.src) : page.src;
                else if (retryCount >= 2) currentSrc = getProxiedUrl(page.src, Date.now());

                const handleRetryClick = (e: React.MouseEvent<HTMLImageElement>) => {
                    const img = e.currentTarget;
                    if (img.style.opacity === '0.25') {
                        e.stopPropagation();
                        setRetries(prev => ({ ...prev, [page.src]: 0 }));
                        img.style.opacity = '1';
                        img.src = IS_NATIVE ? page.src : getProxiedUrl(page.src);
                    }
                };

                return (
                    <div 
                        key={`${page.src}-${index}`} 
                        style={{ 
                            position: 'relative', 
                            width: '100%', 
                            backgroundColor: '#0a0a0a', 
                            aspectRatio: page.width && page.height ? `${page.width}/${page.height}` : undefined, 
                            minHeight: page.width && page.height ? undefined : '300px' 
                        }}
                    >
                        <img
                            src={currentSrc}
                            alt={retryCount >= 3 ? `Tap to retry page ${index + 1}` : `Page ${index + 1}`}
                            loading={index < 3 ? "eager" : "lazy"}
                            decoding="async"
                            referrerPolicy="no-referrer"
                            className="block"
                            style={{ ...imgStyle, opacity: retryCount >= 3 ? 0.25 : 1 }}
                            onClick={handleRetryClick}
                            onError={() => {
                                const nextRetry = (retries[page.src] || 0) + 1;
                                if (nextRetry <= 3) {
                                    setRetries(prev => ({ ...prev, [page.src]: nextRetry }));
                                }
                            }}
                            onLoad={(e) => {
                                const img = e.currentTarget;
                                if (page.trusted) return;

                                const w = img.naturalWidth;
                                const h = img.naturalHeight;

                                const isTinyAd = w <= 300 && h <= 100;
                                const isBanner = w > h * 3 && h < 250;

                                if (isTinyAd || isBanner) {
                                    console.log(`[WebtoonViewer] Hiding ad-like image: ${page.src} (${w}x${h})`);
                                    img.style.display = 'none';
                                }
                            }}
                        />
                    </div>
                );
            })}
        </div>
    );
};
