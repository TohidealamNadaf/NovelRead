import React, { useEffect, useState, useCallback, useRef } from 'react';

interface ReaderScrollerProps {
    containerRef: React.RefObject<HTMLDivElement | null>;
    isVisible?: boolean;
}

export const ReaderScroller: React.FC<ReaderScrollerProps> = ({ containerRef, isVisible = true }) => {
    const [scrollRatio, setScrollRatio] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const [isActive, setIsActive] = useState(false);

    const trackRef = useRef<HTMLDivElement>(null);
    const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Show scorller briefly and reset hide timeout
    const wakeScroller = useCallback(() => {
        setIsActive(true);
        if (hideTimeoutRef.current) {
            clearTimeout(hideTimeoutRef.current);
        }
        hideTimeoutRef.current = setTimeout(() => {
            if (!isDragging) {
                setIsActive(false);
            }
        }, 1500);
    }, [isDragging]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleScroll = () => {
            if (isDragging) return; // Don't fight the user's drag

            const maxScroll = container.scrollHeight - container.clientHeight;
            if (maxScroll <= 0) {
                setScrollRatio(0);
                return;
            }

            setScrollRatio(container.scrollTop / maxScroll);
            wakeScroller();
        };

        container.addEventListener('scroll', handleScroll, { passive: true });
        // Initial setup
        handleScroll();

        return () => {
            container.removeEventListener('scroll', handleScroll);
            if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
        };
    }, [containerRef, isDragging, wakeScroller]);

    // Calculate new scroll position based on mouse/touch Y position
    const calculateNewScrollRatio = useCallback((clientY: number) => {
        if (!trackRef.current) return 0;

        const trackRect = trackRef.current.getBoundingClientRect();
        const thumbHeight = 40; // Approx height of the visual thumb

        // Calculate the clickable area
        const topBound = trackRect.top + (thumbHeight / 2);
        const bottomBound = trackRect.bottom - (thumbHeight / 2);
        const trackHeight = bottomBound - topBound;

        // Calculate raw ratio
        let rawRatio = (clientY - topBound) / trackHeight;

        // Clamp to [0, 1]
        rawRatio = Math.max(0, Math.min(1, rawRatio));

        return rawRatio;
    }, []);

    const scrollToRatio = useCallback((ratio: number) => {
        const container = containerRef.current;
        if (!container) return;

        const maxScroll = container.scrollHeight - container.clientHeight;
        if (maxScroll <= 0) return;

        container.scrollTop = ratio * maxScroll;
        setScrollRatio(ratio);
    }, [containerRef]);

    const handleDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
        // e.preventDefault(); // Removed because of passive event constraint; touch-action: none handles it.
        e.stopPropagation();
        setIsDragging(true);
        wakeScroller();

        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        scrollToRatio(calculateNewScrollRatio(clientY));
    }, [calculateNewScrollRatio, scrollToRatio, wakeScroller]);

    useEffect(() => {
        if (!isDragging) return;

        const handleGlobalMove = (e: MouseEvent | TouchEvent) => {
            e.preventDefault(); // Stop native scrolling
            wakeScroller();
            const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
            scrollToRatio(calculateNewScrollRatio(clientY));
        };

        const handleGlobalEnd = () => {
            setIsDragging(false);
            wakeScroller();
        };

        window.addEventListener('mousemove', handleGlobalMove, { passive: false });
        window.addEventListener('mouseup', handleGlobalEnd);
        window.addEventListener('touchmove', handleGlobalMove, { passive: false });
        window.addEventListener('touchend', handleGlobalEnd);
        window.addEventListener('touchcancel', handleGlobalEnd);

        return () => {
            window.removeEventListener('mousemove', handleGlobalMove);
            window.removeEventListener('mouseup', handleGlobalEnd);
            window.removeEventListener('touchmove', handleGlobalMove);
            window.removeEventListener('touchend', handleGlobalEnd);
            window.removeEventListener('touchcancel', handleGlobalEnd);
        };
    }, [isDragging, calculateNewScrollRatio, scrollToRatio, wakeScroller]);


    if (!isVisible) return null;

    // Determine thumb position
    const topPercentage = `${scrollRatio * 100}%`;

    return (
        <div
            ref={trackRef}
            className={`absolute right-1 top-[15%] bottom-[15%] w-8 z-50 transition-opacity duration-300 pointer-events-none group ${isActive || isDragging ? 'opacity-100' : 'opacity-0'}`}
        >
            <div
                className={`absolute right-1 rounded-full transition-all duration-200 pointer-events-auto cursor-pointer ${isDragging ? 'bg-primary/70 h-10 w-2' : 'bg-slate-300/40 dark:bg-slate-600/40 h-8 w-1 group-hover:bg-slate-400/60 dark:group-hover:bg-slate-500/60 group-hover:w-1.5'}`}
                style={{
                    top: topPercentage,
                    transform: 'translateY(-50%)',
                    touchAction: 'none' // Crucial for preventing mobile pull-to-refresh during drag
                }}
                onMouseDown={handleDragStart}
                onTouchStart={handleDragStart}
            >
                {/* Hitbox expander to make it easier to grab on mobile */}
                <div className="absolute inset-x-[-12px] inset-y-[-8px]" />
            </div>
        </div>
    );
};
