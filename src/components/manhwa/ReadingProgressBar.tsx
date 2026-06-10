import React, { useEffect, useState } from 'react';

interface ReadingProgressBarProps {
    containerRef: React.RefObject<HTMLDivElement | null>;
}

export const ReadingProgressBar: React.FC<ReadingProgressBarProps> = ({ containerRef }) => {
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        // Check overflow style ONCE on mount, not on every scroll frame
        const computedOverflow = getComputedStyle(container).overflowY;
        const isContainerScroll = computedOverflow === 'auto' || computedOverflow === 'scroll';

        let rafId = 0;
        const handleScroll = () => {
            // Throttle to one update per animation frame to prevent jank
            if (rafId) return;
            rafId = requestAnimationFrame(() => {
                rafId = 0;
                if (isContainerScroll) {
                    const total = container.scrollHeight - container.clientHeight;
                    if (total > 0) setProgress((container.scrollTop / total) * 100);
                } else {
                    const scrollTop = window.scrollY || document.documentElement.scrollTop;
                    const total = document.documentElement.scrollHeight - document.documentElement.clientHeight;
                    if (total > 0) setProgress((scrollTop / total) * 100);
                }
            });
        };

        window.addEventListener('scroll', handleScroll, { passive: true });
        if (container) {
            container.addEventListener('scroll', handleScroll, { passive: true });
        }

        return () => {
            window.removeEventListener('scroll', handleScroll);
            if (container) {
                container.removeEventListener('scroll', handleScroll);
            }
            if (rafId) cancelAnimationFrame(rafId);
        };
    }, [containerRef]);

    return (
        <div className="fixed bottom-0 left-0 right-0 h-1 bg-white/5 z-50 pointer-events-none">
            <div
                className="h-full bg-primary transition-all duration-150 ease-out"
                style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            ></div>
        </div>
    );
};
