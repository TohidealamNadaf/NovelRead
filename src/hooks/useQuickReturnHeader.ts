import { useState } from "react";
import { useScroll, useMotionValueEvent } from "framer-motion";
import type { RefObject } from "react";

/**
 * A hook that implements the YouTube-style "quick return" header animation pattern.
 * It hides the header when scrolling down past a threshold, and immediately shows it
 * when scrolling up.
 * 
 * @param containerRef Optional reference to the scroll container (defaults to window)
 * @param threshold The scroll distance in pixels before hiding starts (default 50)
 * @returns boolean `hidden` indicating if the header should be hidden
 */
export function useQuickReturnHeader<T extends HTMLElement = HTMLElement>(containerRef?: RefObject<T | null>, threshold = 50) {
    const { scrollY } = useScroll(containerRef ? { container: containerRef as any } : undefined);
    const [hidden, setHidden] = useState(false);

    useMotionValueEvent(scrollY, "change", (latest) => {
        const previous = scrollY.getPrevious() || 0;
        
        if (latest > previous && latest > threshold) {
            // Scrolling down
            setHidden(true);
        } else if (latest < previous) {
            // Scrolling up
            setHidden(false);
        }
    });

    return hidden;
}
