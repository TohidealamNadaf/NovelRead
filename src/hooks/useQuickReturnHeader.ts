import { useState, useRef } from "react";
import { useScroll, useMotionValueEvent } from "framer-motion";
import type { RefObject } from "react";

/**
 * A hook that implements the YouTube-style "quick return" header animation pattern.
 * It hides the header when scrolling down past a threshold, and immediately shows it
 * when scrolling up.
 * 
 * @param containerRef Optional reference to the scroll container (defaults to window)
 * @param threshold The scroll distance in pixels before hiding starts (default 50)
 * @returns Object containing `hidden` (boolean) and `scrollY` (MotionValue)
 */
export function useQuickReturnHeader<T extends HTMLElement = HTMLElement>(containerRef?: RefObject<T | null>, threshold = 50) {
    const { scrollY } = useScroll(containerRef ? { container: containerRef as any } : undefined);
    const [hidden, setHidden] = useState(false);
    
    // FIX: Ensure the threshold is always read fresh. The `useMotionValueEvent` callback 
    // might capture a stale closure if the threshold prop changes (e.g. when the header 
    // expands/collapses), so we store it in a ref.
    const thresholdRef = useRef(threshold);
    thresholdRef.current = threshold;
    
    // FIX 2: Accumulate scroll delta to prevent jitter.
    // During momentum scrolling, scrollY can jitter by 1-2px in the opposite direction.
    // By accumulating the delta and enforcing a threshold (e.g., 10px), we ensure the state
    // only flips when a genuine scroll-direction change occurs.
    const accumulator = useRef(0);
    const lastDirection = useRef<'up' | 'down' | null>(null);
    const flipThreshold = 10;

    useMotionValueEvent(scrollY, "change", (latest) => {
        const previous = scrollY.getPrevious() || 0;
        const delta = latest - previous;
        
        if (delta === 0) return;

        const currentDirection = delta > 0 ? 'down' : 'up';
        
        // If direction changed or is null, reset accumulator
        if (currentDirection !== lastDirection.current) {
            accumulator.current = 0;
            lastDirection.current = currentDirection;
        }
        
        accumulator.current += Math.abs(delta);

        // Only flip state if we accumulated enough continuous scroll in the new direction
        if (accumulator.current > flipThreshold) {
            if (currentDirection === 'down' && latest > thresholdRef.current) {
                setHidden(true);
            } else if (currentDirection === 'up') {
                setHidden(false);
            }
        }
    });

    return { hidden, scrollY };
}
