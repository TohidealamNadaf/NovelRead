import { useRef, useCallback, useState, useEffect } from 'react';

interface UseAutoScrollOptions {
    scrollContainerRef: React.RefObject<HTMLDivElement | null>;
    onReachEnd?: () => void;
}

/**
 * Custom hook for auto-scrolling content with speed controls.
 * Speed is pixels per second, mapped from 1-10 scale.
 */
export function useAutoScroll({ scrollContainerRef, onReachEnd }: UseAutoScrollOptions) {
    const [isAutoScrolling, setIsAutoScrolling] = useState(false);
    const [speed, setSpeed] = useState(3); // 1-10 scale, default 3 (comfortable reading)
    const rafRef = useRef<number>(0);
    const lastTimeRef = useRef<number>(0);
    const isPausedByTouchRef = useRef(false);
    const accumulatorRef = useRef(0); // Sub-pixel accumulator

    // Map speed (1-10) to pixels per second
    // 1 = slow reading (~30px/s), 5 = moderate (~90px/s), 10 = fast skim (~300px/s)
    const getPixelsPerSecond = useCallback(() => {
        return 15 + speed * 28.5; // 1→43.5, 3→100.5, 5→157.5, 10→300 px/s
    }, [speed]);

    const scrollStep = useCallback((timestamp: number) => {
        if (!scrollContainerRef.current || isPausedByTouchRef.current) {
            rafRef.current = requestAnimationFrame(scrollStep);
            return;
        }

        if (!lastTimeRef.current) lastTimeRef.current = timestamp;
        const delta = timestamp - lastTimeRef.current;
        lastTimeRef.current = timestamp;

        // Accumulate sub-pixel amounts to avoid rounding to 0
        accumulatorRef.current += (getPixelsPerSecond() / 1000) * delta;
        const intScroll = Math.floor(accumulatorRef.current);

        if (intScroll > 0) {
            accumulatorRef.current -= intScroll;
            scrollContainerRef.current.scrollTop += intScroll;
        }

        // Check if we've reached the bottom
        const container = scrollContainerRef.current;
        const isAtBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 5;
        if (isAtBottom) {
            setIsAutoScrolling(false);
            onReachEnd?.();
            return;
        }

        rafRef.current = requestAnimationFrame(scrollStep);
    }, [scrollContainerRef, getPixelsPerSecond, onReachEnd]);

    const startAutoScroll = useCallback(() => {
        lastTimeRef.current = 0;
        setIsAutoScrolling(true);
    }, []);

    const stopAutoScroll = useCallback(() => {
        setIsAutoScrolling(false);
        if (rafRef.current) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = 0;
        }
    }, []);

    const toggleAutoScroll = useCallback(() => {
        if (isAutoScrolling) {
            stopAutoScroll();
        } else {
            startAutoScroll();
        }
    }, [isAutoScrolling, startAutoScroll, stopAutoScroll]);

    // Start/stop the animation loop when state changes
    useEffect(() => {
        if (isAutoScrolling) {
            rafRef.current = requestAnimationFrame(scrollStep);
        } else {
            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = 0;
            }
        }

        return () => {
            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
            }
        };
    }, [isAutoScrolling, scrollStep]);

    // Pause on touch, resume on release (so user can scroll manually while auto-scroll is on)
    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container || !isAutoScrolling) return;

        const handleTouchStart = () => {
            isPausedByTouchRef.current = true;
        };

        const handleTouchEnd = () => {
            isPausedByTouchRef.current = false;
            lastTimeRef.current = 0; // Reset timing to avoid jump
        };

        container.addEventListener('touchstart', handleTouchStart, { passive: true });
        container.addEventListener('touchend', handleTouchEnd, { passive: true });
        container.addEventListener('touchcancel', handleTouchEnd, { passive: true });
        // Also handle mouse for desktop
        container.addEventListener('mousedown', handleTouchStart);
        container.addEventListener('mouseup', handleTouchEnd);

        return () => {
            container.removeEventListener('touchstart', handleTouchStart);
            container.removeEventListener('touchend', handleTouchEnd);
            container.removeEventListener('touchcancel', handleTouchEnd);
            container.removeEventListener('mousedown', handleTouchStart);
            container.removeEventListener('mouseup', handleTouchEnd);
        };
    }, [scrollContainerRef, isAutoScrolling]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, []);

    return {
        isAutoScrolling,
        speed,
        setSpeed,
        toggleAutoScroll,
        startAutoScroll,
        stopAutoScroll,
    };
}
