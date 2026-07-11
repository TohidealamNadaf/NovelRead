import React, { useEffect, useState, useRef, useCallback } from 'react';
import { ChevronsUp, ChevronsDown } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

interface ReadingProgressBarProps {
    containerRef: React.RefObject<HTMLDivElement | null>;
    showControls?: boolean;
}

export const ReadingProgressBar: React.FC<ReadingProgressBarProps> = ({ containerRef, showControls = true }) => {
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

    const handlePointerEvent = (e: React.PointerEvent) => {
        if (!barRef.current) return;
        
        const rect = barRef.current.getBoundingClientRect();
        let fraction = (e.clientX - rect.left) / rect.width;
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

    return (
        <>
            {/* Quick jump buttons */}
            <AnimatePresence>
                {showControls && (
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        className="fixed bottom-28 right-4 flex flex-col gap-2 z-50 pointer-events-auto"
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
            <div 
                ref={barRef}
                className="fixed bottom-0 left-0 right-0 h-6 z-50 touch-none pointer-events-auto flex flex-col justify-end"
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
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 10 }}
                            className="absolute -top-8 -ml-5 px-2 py-1 bg-[#1a1a2e] text-white text-xs font-bold rounded shadow-lg border border-white/10 pointer-events-none"
                            style={{ left: `${currentProgress}%` }}
                        >
                            {Math.round(currentProgress)}%
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* The visual progress bar */}
                <div className="h-1 w-full bg-white/5 relative">
                    <div
                        className="absolute top-0 left-0 bottom-0 bg-primary transition-all duration-150 ease-out"
                        style={{ width: `${Math.min(100, Math.max(0, currentProgress))}%`, transitionDuration: dragProgress !== null ? '0ms' : '150ms' }}
                    ></div>
                </div>
            </div>
        </>
    );
};
