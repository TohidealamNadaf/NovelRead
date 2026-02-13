import { memo } from 'react';
import type { ReactNode, HTMLAttributes } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';

export interface HeaderProps extends HTMLAttributes<HTMLElement> {
    title: string;
    subtitle?: string;
    showBack?: boolean;
    onBack?: () => void;
    leftContent?: ReactNode;
    rightActions?: ReactNode;
    transparent?: boolean;
    withBorder?: boolean;
    titleClassName?: string;
    backButtonLabel?: string;
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
    titleClassName,
    backButtonLabel = "Go back",
    ...props
}: HeaderProps) => {
    const navigate = useNavigate();

    const handleBack = () => {
        if (onBack) {
            onBack();
        } else {
            navigate(-1);
        }
    };

    return (
        <header
            {...props}
            className={clsx(
                // Layout & Position
                "sticky top-0 z-50 w-full flex items-center justify-between",
                // Spacing & Safe Area
                "px-4 py-2 pt-[calc(0.5rem+env(safe-area-inset-top))]",
                // Minimum height for touch targets and stability
                "min-h-[56px] lg:min-h-[64px]",
                // Transitions
                "transition-all duration-300 ease-in-out",
                // Visuals (Glassmorphism)
                !transparent && "bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-xl supports-[backdrop-filter]:bg-background-light/80 dark:supports-[backdrop-filter]:bg-background-dark/80",
                // Border/Shadow
                withBorder && !transparent && "border-b border-slate-200/50 dark:border-white/10 shadow-sm",
                className
            )}
        >
            {/* Left Section (Back Button or Custom) */}
            <div className="flex items-center gap-1 min-w-[40px] shrink-0">
                {showBack ? (
                    <button
                        onClick={handleBack}
                        aria-label={backButtonLabel}
                        className={clsx(
                            "flex items-center justify-center p-2 -ml-2 rounded-full",
                            "text-slate-900 dark:text-white",
                            "hover:bg-slate-100 dark:hover:bg-white/10",
                            "active:scale-95 transition-transform duration-200",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        )}
                    >
                        <ChevronLeft size={24} strokeWidth={2.5} />
                    </button>
                ) : leftContent ? (
                    <div className="-ml-1 flex items-center text-slate-900 dark:text-white">{leftContent}</div>
                ) : null}
            </div>

            {/* Center Section (Title) */}
            <div className="flex-1 flex flex-col justify-center min-w-0 mx-3 text-left">
                <h1 className={clsx(
                    "font-bold tracking-tight text-slate-900 dark:text-white truncate",
                    subtitle ? "text-[15px] leading-tight" : "text-[17px] md:text-lg",
                    titleClassName
                )}>
                    {title}
                </h1>
                {subtitle && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate font-medium mt-0.5">
                        {subtitle}
                    </p>
                )}
            </div>

            {/* Right Section (Actions) */}
            <div className="flex items-center justify-end gap-1 min-w-[40px] shrink-0 text-slate-900 dark:text-white">
                {rightActions}
            </div>
        </header>
    );
});

Header.displayName = 'Header';
