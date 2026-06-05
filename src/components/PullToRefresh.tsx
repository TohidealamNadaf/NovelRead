import React, { useRef, useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { motion, useAnimation, useMotionValue } from 'framer-motion';
import { RefreshCcw } from 'lucide-react';

interface PullToRefreshProps {
    onRefresh: () => Promise<any> | void;
    children: React.ReactNode;
    isDisabled?: boolean;
    className?: string;
    header?: React.ReactNode;
    onScroll?: (e: React.UIEvent<HTMLDivElement>) => void;
}

export const PullToRefresh = forwardRef<HTMLDivElement, PullToRefreshProps>(
    ({ onRefresh, children, isDisabled = false, className = "", header, onScroll }, ref) => {
        const [isRefreshing, setIsRefreshing] = useState(false);
        const containerRef = useRef<HTMLDivElement>(null);
        
        useImperativeHandle(ref, () => containerRef.current as HTMLDivElement);
    const startY = useRef(0);
    const startX = useRef(0);
    const currentY = useRef(0);
    const currentX = useRef(0);
    const isPulling = useRef(false);
    const controls = useAnimation();
    const y = useMotionValue(0);

    const MAX_PULL = 120;
    const THRESHOLD = 80;

    const handleTouchStart = (e: React.TouchEvent | React.MouseEvent) => {
        if (isDisabled || isRefreshing) return;
        
        const container = containerRef.current;
        if (!container) return;

        // Only allow pull-to-refresh if we are at the very top of the scroll container
        if (container.scrollTop > 0) return;

        const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
        const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
        startY.current = clientY;
        startX.current = clientX;
        currentY.current = clientY;
        currentX.current = clientX;
        isPulling.current = true;
    };

    const handleTouchMove = (e: React.TouchEvent | React.MouseEvent) => {
        if (!isPulling.current || isDisabled || isRefreshing) return;

        const container = containerRef.current;
        if (!container || container.scrollTop > 0) {
            isPulling.current = false;
            return;
        }

        const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
        const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
        currentY.current = clientY;
        currentX.current = clientX;

        const pullDistanceY = currentY.current - startY.current;
        const pullDistanceX = Math.abs(currentX.current - startX.current);

        // If the user is scrolling more horizontally than vertically, cancel pull
        if (pullDistanceX > Math.abs(pullDistanceY) && pullDistanceX > 5) {
            isPulling.current = false;
            return;
        }

        // Only start pulling if dragged down by at least a small threshold
        if (pullDistanceY > 5) {
            // Prevent default scrolling when pulling down
            if (e.cancelable) e.preventDefault();
            
            // Apply resistance to the pull
            const resistance = (pullDistanceY - 5) * 0.4;
            const boundedPull = Math.min(resistance, MAX_PULL);
            y.set(boundedPull);
        }
    };

    const handleTouchEnd = async () => {
        if (!isPulling.current || isDisabled || isRefreshing) return;
        isPulling.current = false;

        const currentPull = y.get();

        if (currentPull > THRESHOLD) {
            setIsRefreshing(true);
            controls.start({ y: 50, transition: { type: 'spring', stiffness: 300, damping: 20 } });
            
            try {
                await Promise.resolve(onRefresh());
            } finally {
                setIsRefreshing(false);
                controls.start({ y: 0, transition: { type: 'spring', stiffness: 300, damping: 25 } });
                y.set(0);
            }
        } else {
            controls.start({ y: 0, transition: { type: 'spring', stiffness: 300, damping: 25 } });
            y.set(0);
        }
    };

    // Clean up passive event listeners if necessary, but we'll use React's synthetic events
    // Ensure we handle mouse events for desktop testing
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        // For touch-action, we need to prevent default scrolling when we are actively pulling.
        // We do this via CSS touch-action manipulation if needed, but standard React events work fine.
    }, []);

    return (
        <div 
            className={`flex-1 overflow-y-auto bg-background-light dark:bg-background-dark ${className}`}
            ref={containerRef}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onMouseDown={handleTouchStart}
            onMouseMove={handleTouchMove}
            onMouseUp={handleTouchEnd}
            onMouseLeave={handleTouchEnd}
            onScroll={onScroll}
        >
            {header}
            
            <div className="relative flex flex-col min-h-full">
                {/* Loading Indicator placed behind content */}
                <div className="absolute top-0 left-0 right-0 h-20 flex items-center justify-center pointer-events-none z-0">
                    <motion.div 
                        animate={isRefreshing ? { rotate: 360 } : { rotate: y.get() }}
                        transition={isRefreshing ? { repeat: Infinity, ease: "linear", duration: 1 } : { type: "tween", duration: 0 }}
                        className="size-10 rounded-full bg-white dark:bg-[#1c1c1e] shadow-md flex items-center justify-center border border-slate-100 dark:border-white/10"
                        style={{ 
                            opacity: useMotionValue(1),
                            scale: isRefreshing ? 1 : Math.min(1, Math.max(0.5, y.get() / THRESHOLD))
                        }}
                    >
                        <RefreshCcw size={20} className={isRefreshing ? 'text-primary' : 'text-slate-400'} />
                    </motion.div>
                </div>

                {/* Content Container that gets pulled down */}
                <motion.div
                    className="flex-1 z-10 bg-background-light dark:bg-background-dark"
                    style={{ y }}
                    animate={controls}
                >
                    {children}
                </motion.div>
            </div>
        </div>
    );
});

