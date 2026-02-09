import { useRef, useCallback, useEffect } from 'react';

type NavigationState = 'idle' | 'pulling-prev' | 'pulling-next' | 'loading';

interface UseChapterPullNavigationProps {
    containerRef: React.RefObject<HTMLDivElement | null>;
    hasPrev: boolean;
    hasNext: boolean;
    onLoadPrev: () => void;
    onLoadNext: () => void;
    onPulling?: (distance: number, direction: 'prev' | 'next' | 'none') => void;
    activeChapterId?: string;
    isLoading: boolean;
}

/**
 * useChapterPullNavigation
 * A robust gesture hook for pull-to-navigate functionality.
 * 
 * WHY REFS:
 * We use refs for gesture tracking (state, positions, locks) to avoid React re-renders
 * during high-frequency touch events, ensuring 100% responsiveness and avoiding
 * the "double-load" ghost touch issue common in Capacitor WebViews.
 * 
 * WHY TOUCHEND:
 * Navigation only triggers on touchend to prevent accidental mid-gesture loads
 * that can corrupt scroll state and bridge communication.
 * 
 * WHY LOCKING:
 * isLockedRef serves as a mandatory async barrier. While loading, all gestures
 * and scroll-triggered behaviors are ignored until the DOM has rendered and
 * scroll restoration is complete.
 */
export const useChapterPullNavigation = ({
    containerRef,
    hasPrev,
    hasNext,
    onLoadPrev,
    onLoadNext,
    onPulling,
    activeChapterId,
    isLoading
}: UseChapterPullNavigationProps) => {
    // FSM State and Gesture Data (Stored in refs for performance and determinism)
    const stateRef = useRef<NavigationState>('idle');
    const startYRef = useRef(0);
    const isLockedRef = useRef(false);
    const PULL_THRESHOLD = 80;
    const lastChapterIdRef = useRef(activeChapterId);

    // Watch for Chapter Changes (Sync state back and restore scroll)
    useEffect(() => {
        // Only restore when loading has finished to ensure the new DOM is ready
        if (!isLoading && activeChapterId && activeChapterId !== lastChapterIdRef.current) {
            const currentFsmState = stateRef.current;

            // Determine scroll restoration target
            // Previous -> Scroll to Bottom | Next -> Scroll to Top
            const restorationTarget = currentFsmState === 'pulling-prev' ? 'bottom' : 'top';

            // MANDATORY: Restoration must occur inside requestAnimationFrame
            requestAnimationFrame(() => {
                if (containerRef.current) {
                    if (restorationTarget === 'bottom') {
                        containerRef.current.scrollTop = containerRef.current.scrollHeight;
                    } else {
                        containerRef.current.scrollTop = 0;
                    }
                }

                // RELEASE LOCK only after scroll restoration is finished
                isLockedRef.current = false;
                stateRef.current = 'idle';
            });

            lastChapterIdRef.current = activeChapterId;
        }
    }, [activeChapterId, isLoading, containerRef]);

    const onTouchStart = useCallback((e: React.TouchEvent) => {
        // ASYNC LOCK: Absolute gesture suppression
        if (isLockedRef.current) return;

        const container = containerRef.current;
        if (!container) return;

        startYRef.current = e.touches[0].clientY;
        const scrollTop = container.scrollTop;
        const scrollHeight = container.scrollHeight;
        const clientHeight = container.clientHeight;

        // Direction detection: Only activate if at exact scroll boundaries
        if (scrollTop <= 2 && hasPrev) {
            stateRef.current = 'pulling-prev';
        } else if (scrollHeight - scrollTop - clientHeight <= 5 && hasNext) {
            stateRef.current = 'pulling-next';
        } else {
            stateRef.current = 'idle';
        }
    }, [containerRef, hasPrev, hasNext]);

    const onTouchMove = useCallback((e: React.TouchEvent) => {
        if (isLockedRef.current || stateRef.current === 'idle') return;

        const currentY = e.touches[0].clientY;
        const diffY = currentY - startYRef.current;

        // Validation: If user reverses direction mid-pull, abort gesture
        if (stateRef.current === 'pulling-prev' && diffY < 0) {
            stateRef.current = 'idle';
            onPulling?.(0, 'none');
        } else if (stateRef.current === 'pulling-next' && diffY > 0) {
            stateRef.current = 'idle';
            onPulling?.(0, 'none');
        } else {
            // Provide visual feedback
            onPulling?.(Math.abs(diffY), stateRef.current === 'pulling-prev' ? 'prev' : 'next');
        }
    }, [onPulling]);

    const onTouchEnd = useCallback((e: React.TouchEvent) => {
        if (isLockedRef.current || stateRef.current === 'idle') {
            stateRef.current = 'idle';
            onPulling?.(0, 'none');
            return;
        }

        const currentY = e.changedTouches[0].clientY;
        const diffY = currentY - startYRef.current;
        const absDiffY = Math.abs(diffY);

        // Reset visual feedback state immediately
        onPulling?.(0, 'none');

        // THRESHOLD CHECK: Trigger navigation only if pull distance is sufficient
        if (absDiffY >= PULL_THRESHOLD) {
            // ACTIVATE LOCK: Prevent secondary triggers during async transition
            const prevState = stateRef.current;
            isLockedRef.current = true;
            stateRef.current = 'loading';

            if (prevState === 'pulling-prev') {
                onLoadPrev();
            } else if (prevState === 'pulling-next') {
                onLoadNext();
            }
        } else {
            stateRef.current = 'idle';
        }
    }, [onLoadPrev, onLoadNext, onPulling]);

    return {
        onTouchStart,
        onTouchMove,
        onTouchEnd,
        state: stateRef.current
    };
};
