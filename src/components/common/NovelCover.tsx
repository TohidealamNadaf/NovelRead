import { useState, useEffect, useRef, memo } from 'react';
import { BookOpen } from 'lucide-react';
import clsx from 'clsx';

interface NovelCoverProps {
    src?: string | null;
    title: string;
    className?: string;
    category?: string;
    loading?: 'lazy' | 'eager';
}

export const NovelCover = memo(({
    src,
    title,
    className,
    category,
    loading = 'lazy'
}: NovelCoverProps) => {
    const [hasError, setHasError] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);
    const imgRef = useRef<HTMLImageElement | null>(null);

    // Reset error state and check if image is already cached/complete on mount or when src changes
    useEffect(() => {
        setHasError(false);
        const img = imgRef.current;
        if (img?.complete) {
            if (img.naturalWidth > 0) {
                setIsLoaded(true);
            } else if (img.src && img.naturalWidth === 0) {
                setHasError(true);
            }
        }
    }, [src]);

    const isPlaceholderUrl = !src || src === '/placeholder-cover.jpg' || src === '/placeholder-cover.svg' || src.trim() === '';

    if (isPlaceholderUrl || hasError) {
        return (
            <div
                className={clsx(
                    "relative size-full flex flex-col items-center justify-center p-3 text-center overflow-hidden select-none",
                    "bg-gradient-to-br from-slate-800 via-slate-900 to-indigo-950 text-white/90",
                    className
                )}
                aria-hidden="true"
                draggable={false}
                onDragStart={(e) => e.preventDefault()}
            >
                {/* Decorative Background Overlay */}
                <div className="absolute inset-0 opacity-15 bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:12px_12px]" />
                
                {/* Book Icon */}
                <div className="size-10 rounded-xl bg-white/10 backdrop-blur-sm border border-white/10 flex items-center justify-center mb-2 shadow-inner">
                    <BookOpen size={20} className="text-primary/90" />
                </div>

                {/* Title Preview */}
                <p className="text-[11px] font-bold line-clamp-3 leading-tight tracking-tight text-white/90 px-1 drop-shadow-sm">
                    {title}
                </p>

                {category && category !== 'Unknown' && (
                    <span className="mt-2 text-[9px] uppercase tracking-widest font-extrabold text-primary/80 bg-primary/10 px-1.5 py-0.5 rounded">
                        {category}
                    </span>
                )}
            </div>
        );
    }

    return (
        <div 
            className={clsx("relative size-full overflow-hidden select-none bg-slate-200 dark:bg-slate-800", className)}
            draggable={false}
            onDragStart={(e) => e.preventDefault()}
        >
            {/* Shimmer Placeholder while loading */}
            {!isLoaded && (
                <div 
                    className="absolute inset-0 bg-slate-200 dark:bg-slate-800 animate-pulse flex items-center justify-center z-10 pointer-events-none"
                    aria-hidden="true"
                >
                    <BookOpen size={22} className="text-slate-400/40" />
                </div>
            )}

            <img
                ref={(node) => {
                    imgRef.current = node;
                    if (node?.complete) {
                        if (node.naturalWidth > 0 && !isLoaded) {
                            setIsLoaded(true);
                        } else if (node.src && node.naturalWidth === 0 && !hasError) {
                            setHasError(true);
                        }
                    }
                }}
                src={src}
                alt=""
                aria-hidden="true"
                draggable={false}
                loading={loading}
                decoding="async"
                referrerPolicy="no-referrer"
                onDragStart={(e) => e.preventDefault()}
                onLoad={() => {
                    setIsLoaded(true);
                    setHasError(false);
                }}
                onError={() => {
                    setHasError(true);
                    setIsLoaded(false);
                }}
                className="size-full object-cover pointer-events-none select-none"
            />
        </div>
    );
});

NovelCover.displayName = 'NovelCover';
