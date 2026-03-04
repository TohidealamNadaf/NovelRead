import { useRef, useCallback, useEffect, useState } from 'react';

type NavigationState =
    | 'idle'
    | 'pulling-prev'
    | 'pulling-next'
    | 'loading'
    | 'loading-prev'
    | 'loading-next';

interface UseChapterPullNavigationProps {
    containerRef: React.RefObject<HTMLDivElement | null>;
    hasPrev: boolean;
    hasNext: boolean;
    onLoadPrev: () => Promise<void> | void;
    onLoadNext: () => Promise<void> | void;
    onPulling?: (distance: number, direction: 'prev' | 'next' | 'none') => void;
    activeChapterId?: string;
    isLoading: boolean;
}

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
    const [state, setState] = useState<NavigationState>('idle');

    const startYRef = useRef(0);
    const diffYRef = useRef(0);
    const isLockedRef = useRef(false);
    const isTouchingRef = useRef(false);
    const lastChapterIdRef = useRef(activeChapterId);

    const PULL_THRESHOLD = 120;
    const BOUNDARY_TOLERANCE = 12;

    // ---------------------------
    // SAFE SCROLL RESTORATION
    // ---------------------------
    useEffect(() => {
        if (activeChapterId && activeChapterId !== lastChapterIdRef.current) {
            const container = containerRef.current;
            if (container) {
                const wasPrev = state === 'loading-prev';

                if (!isLoading) {
                    // Wait 2 frames to ensure layout stabilizes
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                            if (wasPrev) {
                                container.scrollTop = container.scrollHeight;
                            } else {
                                container.scrollTop = 0;
                            }
                            lastChapterIdRef.current = activeChapterId;
                        });
                    });
                }
            } else {
                lastChapterIdRef.current = activeChapterId;
            }
        }
    }, [activeChapterId, isLoading]);

    // ---------------------------
    // TOUCH START
    // ---------------------------
    const onTouchStart = useCallback(
        (e: React.TouchEvent) => {
            if (isLockedRef.current) return;
            if (e.touches.length !== 1) return;

            const container = containerRef.current;
            if (!container) return;

            isTouchingRef.current = true;
            startYRef.current = e.touches[0].clientY;
            diffYRef.current = 0; // Reset movement

            const { scrollTop, scrollHeight, clientHeight } = container;

            // Use a small tolerance for "at top/bottom" detection
            const atTop = scrollTop <= BOUNDARY_TOLERANCE;
            const atBottom = scrollHeight - scrollTop - clientHeight <= BOUNDARY_TOLERANCE;

            // If we are at both (short content), we don't know the intent yet
            // If just top/bottom, we set a temporary state to track movement
            if (atTop || atBottom) {
                // We use 'idle' here but diffYRef will tell us where we're going
                // Actually, let's keep it 'idle' and determine in onTouchMove
                setState('idle');
            }
        },
        [containerRef]
    );

    // ---------------------------
    // TOUCH MOVE
    // ---------------------------
    const onTouchMove = useCallback(
        (e: React.TouchEvent) => {
            if (isLockedRef.current) return;
            if (!isTouchingRef.current) return;

            const container = containerRef.current;
            if (!container) return;

            const currentY = e.touches[0].clientY;
            const diffY = currentY - startYRef.current;
            diffYRef.current = diffY;

            const { scrollTop, scrollHeight, clientHeight } = container;
            const atTop = scrollTop <= BOUNDARY_TOLERANCE;
            const atBottom = scrollHeight - scrollTop - clientHeight <= BOUNDARY_TOLERANCE;

            let currentState = state;
            // 1. Determine Intent (if idle)
            if (currentState === 'idle') {
                if (diffY > 10 && atTop) {
                    setState('pulling-prev');
                    currentState = 'pulling-prev';
                } else if (diffY < -10 && atBottom) {
                    setState('pulling-next');
                    currentState = 'pulling-next';
                } else {
                    return;
                }
            }

            // 2. Validate Movement Direction relative to current State
            if (currentState === 'pulling-prev' && diffY < 0) {
                setState('idle');
                onPulling?.(0, 'none');
                return;
            }

            if (currentState === 'pulling-next' && diffY > 0) {
                setState('idle');
                onPulling?.(0, 'none');
                return;
            }

            // 3. Update Progress (Clamp to avoid wild values during rapid scrolls)
            // Subtract threshold so it starts smooth from 0
            const effectiveDiff = Math.max(0, Math.abs(diffY) - 10);
            onPulling?.(
                Math.min(effectiveDiff, window.innerHeight),
                currentState === 'pulling-prev' ? 'prev' : 'next'
            );
        },
        [state, onPulling, containerRef]
    );

    // ---------------------------
    // TOUCH END
    // ---------------------------
    const onTouchEnd = useCallback(async () => {
        if (isLockedRef.current) return;

        isTouchingRef.current = false;

        // Ensure visual state resets immediately
        onPulling?.(0, 'none');

        const absDiff = Math.abs(diffYRef.current);

        if (state === 'idle') return;

        if (absDiff >= PULL_THRESHOLD) {
            const isPrev = state === 'pulling-prev';
            const canNavigate =
                (isPrev && hasPrev) || (!isPrev && hasNext);

            if (canNavigate) {
                isLockedRef.current = true;
                setState(isPrev ? 'loading-prev' : 'loading-next');

                try {
                    if (isPrev) {
                        await onLoadPrev();
                    } else {
                        await onLoadNext();
                    }
                } finally {
                    // CRITICAL: Always release gesture lock
                    isLockedRef.current = false;
                    setState('idle');
                    diffYRef.current = 0;
                }
            } else {
                setState('idle');
            }
        } else {
            setState('idle');
        }

        diffYRef.current = 0;
    }, [state, hasPrev, hasNext, onLoadPrev, onLoadNext, onPulling]);

    const onTouchCancel = useCallback(() => {
        isTouchingRef.current = false;
        diffYRef.current = 0;
        setState('idle');

        // Ensure visual indicators reset completely
        if (onPulling) {
            onPulling(0, 'none');
        }
    }, [onPulling]);

    return {
        onTouchStart,
        onTouchMove,
        onTouchEnd,
        onTouchCancel,
        state
    };
};
