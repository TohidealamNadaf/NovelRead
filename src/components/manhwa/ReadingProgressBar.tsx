import React, { useEffect, useState } from 'react';

interface ReadingProgressBarProps {
    containerRef: React.RefObject<HTMLDivElement | null>;
}

export const ReadingProgressBar: React.FC<ReadingProgressBarProps> = ({ containerRef }) => {
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleScroll = () => {
            // For window scroll (if body is scrolling)
            const scrollTop = window.scrollY || document.documentElement.scrollTop;
            const scrollHeight = document.documentElement.scrollHeight;
            const clientHeight = document.documentElement.clientHeight;

            // If we were scrolling a specific container, we'd use container.scrollTop etc.
            // But usually the reader page scrolls the body or a main wrapper.
            // Let's assume body scroll for now as per standard mobile web apps, 
            // unless the container itself has overflow-y: scroll.

            // Checking if container has overflow
            const isContainerScroll = getComputedStyle(container).overflowY === 'auto' || getComputedStyle(container).overflowY === 'scroll';

            if (isContainerScroll) {
                const total = container.scrollHeight - container.clientHeight;
                const current = container.scrollTop;
                setProgress((current / total) * 100);
            } else {
                const total = scrollHeight - clientHeight;
                setProgress((scrollTop / total) * 100);
            }
        };

        // Attach to window or container depending on architecture
        // In the ManhwaReader, we might stick to window scroll for better mobile feel
        window.addEventListener('scroll', handleScroll);

        // Also check container if it's the one scrolling
        if (container) {
            container.addEventListener('scroll', handleScroll);
        }

        return () => {
            window.removeEventListener('scroll', handleScroll);
            if (container) {
                container.removeEventListener('scroll', handleScroll);
            }
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
