import type { ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';

interface HeaderProps {
    title: string;
    showBack?: boolean;
    onBack?: () => void;
    leftContent?: ReactNode;
    rightActions?: ReactNode;
    className?: string;
    transparent?: boolean;
    withBorder?: boolean;
    subtitle?: string;
}

export const Header = ({
    title,
    subtitle,
    showBack = false,
    onBack,
    leftContent,
    rightActions,
    className,
    transparent = false,
    withBorder = false
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
        <div
            className={clsx(
                "sticky top-0 z-40 w-full flex items-center justify-between px-4 py-3 transition-colors duration-200 pt-[env(safe-area-inset-top)]",
                !transparent && "bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md supports-[backdrop-filter]:bg-background-light/80 dark:supports-[backdrop-filter]:bg-background-dark/80",
                withBorder && "border-b border-slate-200 dark:border-white/5",
                className
            )}
        >
            <div className="flex items-center gap-3 flex-1 min-w-0">
                {showBack ? (
                    <button
                        onClick={handleBack}
                        className="flex items-center justify-center p-2 -ml-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors active:scale-95"
                    >
                        <ChevronLeft size={24} className="text-slate-900 dark:text-white" />
                    </button>
                ) : leftContent ? (
                    <div className="-ml-1">{leftContent}</div>
                ) : null}

                <div className={clsx("flex flex-col min-w-0", (!showBack && !leftContent) && "ml-0")}>
                    <h1 className={clsx(
                        "font-bold tracking-tight text-slate-900 dark:text-white truncate",
                        subtitle ? "text-sm leading-tight" : "text-xl"
                    )}>
                        {title}
                    </h1>
                    {subtitle && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate font-medium">
                            {subtitle}
                        </p>
                    )}
                </div>
            </div>

            {rightActions && (
                <div className="flex items-center gap-2">
                    {rightActions}
                </div>
            )}
        </div>
    );
};
