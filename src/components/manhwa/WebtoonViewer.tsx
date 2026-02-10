import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

interface WebtoonViewerProps {
    content?: string; // HTML content or just parsing logic
    images?: string[]; // If we pre-parse (preferred)
    isLoading?: boolean;
}

export const WebtoonViewer: React.FC<WebtoonViewerProps> = ({ content, images: propImages, isLoading }) => {
    const [images, setImages] = useState<string[]>([]);

    useEffect(() => {
        if (propImages && propImages.length > 0) {
            setImages(propImages);
        } else if (content) {
            // Parse images from HTML string
            const parser = new DOMParser();
            const doc = parser.parseFromString(content, 'text/html');
            const imgTags = Array.from(doc.getElementsByTagName('img'));
            const imageUrls = imgTags
                .map(img => img.getAttribute('src') || img.getAttribute('data-src'))
                .filter((src): src is string => !!src);
            setImages(imageUrls);
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
                    src={src}
                    alt={`Page ${index + 1}`}
                    loading="lazy"
                    className="w-full h-auto block"
                    style={{ margin: 0, padding: 0, display: 'block' }}
                />
            ))}
        </div>
    );
};
