import React, { useEffect, useState, useRef, useCallback } from 'react';
import { ChevronsUp, ChevronsDown } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

export type ProgressBarPosition = 'top' | 'bottom' | 'left' | 'right' | 'off';

interface ReadingProgressBarProps {
    containerRef: React.RefObject<HTMLDivElement | null>;
    showControls?: boolean;
    position?: ProgressBarPosition;
}

export const ReadingProgressBar: React.FC<ReadingProgressBarProps> = ({ 
    containerRef, 
    showControls = true,
    position = 'bottom'
}) => {
    const [progress, setProgress] = useState(0);
    const [dragProgress, setDragProgress] = useState<number | null>(null);
    const barRef = useRef<HTMLDivElement>(null);
    const isDragging = useRef(false);

    // Reusable logic to detect scroll container
    const getScrollContext = useCallback(() => {
        const container = containerRef.current;
        if (!container) return null;
        
        const computedOverflow = getComputedStyle(container).overflowY;
        const isContainerScroll = computedOverflow === 'auto' || computedOverflow === 'scroll';
        
        return { container, isContainerScroll };
    }, [containerRef]);

    const scrollToFraction = useCallback((fraction: number, smooth: boolean = false) => {
        const context = getScrollContext();
        if (!context) return;
        const { container, isContainerScroll } = context;

        if (isContainerScroll) {
            const total = container.scrollHeight - container.clientHeight;
            if (total > 0) {
                container.scrollTo({ top: total * fraction, behavior: smooth ? 'smooth' : 'auto' });
            }
        } else {
            const total = document.documentElement.scrollHeight - document.documentElement.clientHeight;
            if (total > 0) {
                window.scrollTo({ top: total * fraction, behavior: smooth ? 'smooth' : 'auto' });
            }
        }
    }, [getScrollContext]);

    useEffect(() => {
        const context = getScrollContext();
        if (!context) return;
        const { container, isContainerScroll } = context;

        let rafId = 0;
        const handleScroll = () => {
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
    }, [getScrollContext]);

    const isVertical = position === 'left' || position === 'right';

    const handlePointerEvent = (e: React.PointerEvent) => {
        if (!barRef.current) return;
        
        const rect = barRef.current.getBoundingClientRect();
        let fraction = 0;
        if (isVertical) {
            fraction = (e.clientY - rect.top) / rect.height;
        } else {
            fraction = (e.clientX - rect.left) / rect.width;
        }
        fraction = Math.max(0, Math.min(1, fraction));
        
        setDragProgress(fraction * 100);
        scrollToFraction(fraction);
    };

    const onPointerDown = (e: React.PointerEvent) => {
        isDragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        handlePointerEvent(e);
    };

    const onPointerMove = (e: React.PointerEvent) => {
        if (!isDragging.current) return;
        handlePointerEvent(e);
    };

    const onPointerUp = (e: React.PointerEvent) => {
        if (!isDragging.current) return;
        isDragging.current = false;
        e.currentTarget.releasePointerCapture(e.pointerId);
        setDragProgress(null);
    };

    const currentProgress = dragProgress !== null ? dragProgress : progress;

    // Quick jump button alignment based on position
    const quickJumpClass = position === 'right' 
        ? "fixed bottom-28 left-4 flex flex-col gap-2 z-50 pointer-events-auto"
        : "fixed bottom-28 right-4 flex flex-col gap-2 z-50 pointer-events-auto";

    // Scrubber area layout based on position
    let scrubberClass = "fixed z-50 touch-none pointer-events-auto flex ";
    if (position === 'bottom') scrubberClass += "bottom-0 left-0 right-0 h-6 flex-col justify-end";
    else if (position === 'top') scrubberClass += "top-0 left-0 right-0 h-6 flex-col justify-start";
    else if (position === 'left') scrubberClass += "top-0 bottom-0 left-0 w-6 flex-row justify-start";
    else if (position === 'right') scrubberClass += "top-0 bottom-0 right-0 w-6 flex-row justify-end";

    // Tooltip layout
    const getTooltipStyle = () => {
        if (isVertical) {
            return {
                top: `${currentProgress}%`,
                [position === 'right' ? 'right' : 'left']: '32px',
                transform: 'translateY(-50%)'
            };
        }
        return {
            left: `${currentProgress}%`,
            [position === 'top' ? 'top' : 'bottom']: '32px',
            transform: 'translateX(-50%)'
        };
    };

    return (
        <>
            {/* Quick jump buttons */}
            <AnimatePresence>
                {showControls && (
                    <motion.div
                        initial={{ opacity: 0, x: position === 'right' ? -20 : 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: position === 'right' ? -20 : 20 }}
                        className={quickJumpClass}
                    >
                        <button
                            onClick={(e) => { e.stopPropagation(); scrollToFraction(0, true); }}
                            className="h-10 w-10 flex items-center justify-center rounded-full bg-[#1a1a2e]/95 backdrop-blur-xl border border-white/10 shadow-lg text-white hover:text-primary active:scale-90 transition-all"
                        >
                            <ChevronsUp size={20} />
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); scrollToFraction(1, true); }}
                            className="h-10 w-10 flex items-center justify-center rounded-full bg-[#1a1a2e]/95 backdrop-blur-xl border border-white/10 shadow-lg text-white hover:text-primary active:scale-90 transition-all"
                        >
                            <ChevronsDown size={20} />
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Drag scrubber area */}
            {position !== 'off' && (
                <div 
                    ref={barRef}
                    className={scrubberClass}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerUp}
                    onClick={(e) => e.stopPropagation()} 
                >
                    {/* Tooltip while dragging */}
                    <AnimatePresence>
                        {dragProgress !== null && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                className="absolute px-2 py-1 bg-[#1a1a2e] text-white text-xs font-bold rounded shadow-lg border border-white/10 pointer-events-none"
                                style={getTooltipStyle()}
                            >
                                {Math.round(currentProgress)}%
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* The visual progress bar */}
                    <div className={`${isVertical ? 'w-1 h-full' : 'h-1 w-full'} bg-white/5 relative`}>
                        <div
                            className="absolute top-0 left-0 bg-primary transition-all duration-150 ease-out"
                            style={{ 
                                [isVertical ? 'height' : 'width']: `${Math.min(100, Math.max(0, currentProgress))}%`, 
                                [isVertical ? 'width' : 'height']: '100%',
                                transitionDuration: dragProgress !== null ? '0ms' : '150ms' 
                            }}
                        ></div>
                    </div>
                </div>
            )}
        </>
    );
};
