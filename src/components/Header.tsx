import { memo, useState, useEffect, useCallback, useRef } from 'react';
import type { ReactNode, HTMLAttributes, ElementType, RefObject } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { motion, AnimatePresence } from 'framer-motion';

export interface HeaderProps extends HTMLAttributes<HTMLElement> {
    title: string;
    subtitle?: string;
    showBack?: boolean;
    onBack?: () => void;
    leftContent?: ReactNode;
    rightActions?: ReactNode;
    transparent?: boolean;
    
    /** @deprecated Use autoElevate instead */
    withBorder?: boolean;
    titleClassName?: string;
    backButtonLabel?: string;
    
    // --- New Props ---
    /** 1. Automatically applies border/shadow when scrolled (default: true) */
    autoElevate?: boolean;
    
    /** 2. Standard compact header or iOS-style large title (default: "standard") */
    variant?: 'standard' | 'large';
    
    /** 3. Semantic heading element for the title (default: "h1") */
    as?: ElementType;
    
    /** 4. Replaces title/subtitle with a skeleton pulse (default: false) */
    loading?: boolean;
    
    // --- Fixes Props ---
    /** 
     * Optional ref to a scrollable container. If provided, the scroll listener 
     * attaches to this element instead of the window. 
     */
    scrollContainerRef?: RefObject<HTMLElement | null>;
    
    /** 
     * Key used to trigger the title enter/exit animation.
     * By default, changes to the title text don't re-trigger the transition,
     * but you can pass e.g., `location.pathname` to animate on route changes.
     */
    navigationKey?: string;
}

// Utility to merge tailwind classes properly
function cn(...inputs: (string | undefined | null | false)[]) {
    return twMerge(clsx(inputs));
}

export const Header = memo(({
    title,
    subtitle,
    showBack = false,
    onBack,
    leftContent,
    rightActions,
    className,
    transparent = false,
    withBorder = false,
    autoElevate = true,
    variant = 'standard',
    as: TitleComponent = 'h1',
    loading = false,
    titleClassName,
    backButtonLabel = "Go back",
    scrollContainerRef,
    navigationKey,
    ...props
}: HeaderProps) => {
    const navigate = useNavigate();
    
    // FIX 1 & 3: Scroll listener attached to correct element + Throttled via requestAnimationFrame
    // If scrollContainerRef is provided, it reads scrollTop from it instead of window.scrollY.
    // The handleScroll function sets a ticking flag to prevent layout thrashing on fast scrolls.
    const [isScrolled, setIsScrolled] = useState(false);
    useEffect(() => {
        if (!autoElevate && variant !== 'large') return;
        
        const target = scrollContainerRef?.current ?? window;
        
        // FIX 1: Apply overflow-anchor: none to the actual scroll container if provided.
        // NOTE: If using window scrolling, you must apply `overflow-anchor: none` 
        // globally to `html` or `body` in your CSS. 
        // overflow-anchor:none on the header only excludes the header from being 
        // selected as the anchor node — it does not stop the browser from adjusting 
        // scrollY when the header's height change shifts the position of content below it.
        let targetElement: HTMLElement | null = null;
        let originalOverflowAnchor = '';
        if (scrollContainerRef?.current) {
            targetElement = scrollContainerRef.current;
            originalOverflowAnchor = targetElement.style.overflowAnchor;
            targetElement.style.overflowAnchor = 'none';
        }

        let ticking = false;
        
        const updateScroll = () => {
            const scrollY = target === window 
                ? window.scrollY 
                : (target as HTMLElement).scrollTop;
                
            // Use hysteresis (different thresholds for unmounting vs mounting)
            // to prevent bouncing loops when the header's height changes.
            setIsScrolled(prev => {
                if (!prev && scrollY > 60) return true;
                if (prev && scrollY < 10) return false;
                return prev;
            });
            ticking = false;
        };

        const handleScroll = () => {
            if (!ticking) {
                requestAnimationFrame(updateScroll);
                ticking = true;
            }
        };
        
        target.addEventListener('scroll', handleScroll, { passive: true });
        // Trigger once on mount to check initial position
        updateScroll();
        return () => {
            target.removeEventListener('scroll', handleScroll);
            if (targetElement) {
                targetElement.style.overflowAnchor = originalOverflowAnchor;
            }
        };
    }, [autoElevate, variant, scrollContainerRef]);

    // FIX 2: Memory leak prevention
    // Store the timeout ID in a ref and clean it up when the component unmounts
    // to avoid setting state on an unmounted component.
    const [isNavigating, setIsNavigating] = useState(false);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    
    useEffect(() => {
        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, []);

    const handleBack = useCallback(() => {
        if (isNavigating) return;
        setIsNavigating(true);
        
        if (onBack) {
            onBack();
        } else {
            navigate(-1);
        }
        
        // Debounce back button for 500ms
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => setIsNavigating(false), 500);
    }, [isNavigating, onBack, navigate]);

    // Determine if we should show the compact title inside the center flex box
    const showCompactTitle = variant === 'standard' || (variant === 'large' && isScrolled);
    const applyElevation = withBorder || (autoElevate && isScrolled);

    // 7. Animation polish transitions
    const textTransition = { duration: 0.2, ease: 'easeOut' as const };

    return (
        <header
            // 3. Accessibility: role="banner"
            role="banner"
            {...props}
            className={cn(
                // Layout & Position
                "sticky top-0 z-50 w-full flex flex-col",
                // Transitions
                "transition-all duration-300 ease-in-out",
                // Visuals (Glassmorphism)
                !transparent && "bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-xl supports-[backdrop-filter]:bg-background-light/80 dark:supports-[backdrop-filter]:bg-background-dark/80",
                // Border/Shadow (1. Scroll-aware elevation)
                applyElevation && !transparent && "border-b border-slate-200/50 dark:border-white/10 shadow-sm",
                className
            )}
        >
            <div className={cn(
                "w-full flex items-center justify-between",
                // 8. Safe-area handling (Top only, bottom is not applicable for top headers)
                "px-4 py-2 pt-[calc(0.5rem+env(safe-area-inset-top))]",
                // Minimum height for touch targets and stability
                "min-h-[56px] lg:min-h-[64px]"
            )}>
                {/* Left Section (Back Button or Custom) */}
                <div className={cn(
                    "flex items-center gap-1 shrink-0 transition-[min-width] duration-300",
                    (showBack || leftContent) ? "min-w-[40px]" : "min-w-0 w-0 hidden"
                )}>
                    {showBack ? (
                        <button
                            onClick={handleBack}
                            disabled={isNavigating}
                            aria-label={backButtonLabel}
                            className={cn(
                                // 5. RTL support: -ms-2 instead of -ml-2
                                "flex items-center justify-center p-2 -ms-2 rounded-full",
                                "text-slate-900 dark:text-white",
                                "hover:bg-slate-100 dark:hover:bg-white/10",
                                "active:scale-95 transition-transform duration-200",
                                // 3. Accessibility: focus ring
                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
                            )}
                        >
                            {/* 5. RTL support: flip chevron */}
                            <ChevronLeft size={24} strokeWidth={2.5} className="rtl:-scale-x-100" />
                        </button>
                    ) : leftContent ? (
                        <div className="-ms-1 flex items-center text-slate-900 dark:text-white">{leftContent}</div>
                    ) : null}
                </div>

                {/* Center Section (Title) */}
                {/* 5. RTL support: text-start instead of text-left */}
                <div className="flex-1 flex flex-col justify-center min-w-0 mx-3 text-start">
                    {/* 4. Loading / skeleton state */}
                    {loading ? (
                        <div className="flex flex-col gap-1.5" aria-hidden="true">
                            <div className="h-5 w-32 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                            {subtitle !== undefined && (
                                <div className="h-3 w-20 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                            )}
                        </div>
                    ) : (
                        <AnimatePresence mode="popLayout">
                            {showCompactTitle && (
                                <motion.div 
                                    // FIX 5: Title/subtitle re-animate on every prop change
                                    // Now only triggers transition on explicit navigationKey changes 
                                    // rather than every string update, to prevent distracting flashes on live text.
                                    key={navigationKey ?? 'compact-title'}
                                    initial={{ opacity: 0, y: 5 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -5 }}
                                    transition={textTransition}
                                    className="flex flex-col"
                                >
                                    {/* 3. Accessibility: Semantic HTML with TitleComponent */}
                                    <TitleComponent className={cn(
                                        "font-bold tracking-tight text-slate-900 dark:text-white truncate",
                                        subtitle ? "text-[15px] leading-tight" : "text-[17px] md:text-lg",
                                        titleClassName
                                    )}>
                                        {title}
                                    </TitleComponent>
                                    {subtitle && (
                                        // 3. Accessibility: WCAG AA colors (slate-600/slate-300 pass 7:1)
                                        <p className="text-[11px] text-slate-600 dark:text-slate-300 truncate font-medium mt-0.5">
                                            {subtitle}
                                        </p>
                                    )}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    )}
                </div>

                {/* Right Section (Actions) */}
                <div className="flex items-center justify-end gap-1 min-w-[40px] shrink-0 text-slate-900 dark:text-white">
                    {rightActions}
                </div>
            </div>

            {/* 2. iOS-style large title support */}
            {variant === 'large' && (
                <div
                    // FIX 2: The wrapper's height is now fixed and constant at all times (h-[80px]).
                    // The header's total rendered height is perfectly identical whether isScrolled 
                    // is true or false. This guarantees no layout shifts exist to trigger a bounce loop.
                    className="h-[80px] overflow-hidden"
                >
                    <motion.div
                        // Inner content animates opacity and scale via GPU compositing only
                        initial={false}
                        animate={{ 
                            opacity: (isScrolled || loading) ? 0 : 1, 
                            scale: (isScrolled || loading) ? 0.95 : 1 
                        }}
                        transition={{ duration: 0.2, ease: 'easeInOut' }}
                        className="px-4 pb-3 flex flex-col justify-end text-start origin-top-left rtl:origin-top-right h-full"
                    >
                        <TitleComponent className={cn(
                            "font-bold tracking-tight text-slate-900 dark:text-white truncate",
                            "text-2xl md:text-3xl",
                            titleClassName
                        )}>
                            {title}
                        </TitleComponent>
                        {subtitle && (
                            <p className="text-sm text-slate-600 dark:text-slate-300 truncate font-medium mt-1">
                                {subtitle}
                            </p>
                        )}
                    </motion.div>
                </div>
            )}
        </header>
    );
});

Header.displayName = 'Header';
