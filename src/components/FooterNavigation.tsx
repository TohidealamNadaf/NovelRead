import { Link, useLocation } from 'react-router-dom';
import { BookOpen, Compass, Upload, Headphones, User } from 'lucide-react';
import clsx from 'clsx';

export const FooterNavigation = () => {
    const location = useLocation();

    // Items strictly as per user request + Import preservation
    const navItems = [
        { icon: BookOpen, label: 'Library', path: '/' },
        { icon: Compass, label: 'Discover', path: '/discover' },
        { icon: Upload, label: 'Import', path: '/import', primary: true }, // Keep middle button
        { icon: Headphones, label: 'AI Audio', path: '/audio' },
        { icon: User, label: 'Profile', path: '/profile' }, // Added Profile, Removed Settings (accessible via Profile)
    ];

    return (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 dark:bg-[#121118]/95 backdrop-blur-md border-t border-slate-200 dark:border-white/5 pb-[env(safe-area-inset-bottom,24px)] pt-2">
            <div className="flex justify-around items-center px-2">
                {navItems.map((item) => {
                    // Highlight active state if path matches or starts with path (for sub-routes like /discover/fantasy)
                    // Exception: Home '/' should only match exact, otherwise it matches everything
                    const isActive = item.path === '/'
                        ? location.pathname === '/'
                        : location.pathname.startsWith(item.path);

                    if (item.primary) {
                        return (
                            <Link
                                key={item.path}
                                to={item.path}
                                className="relative flex items-center justify-center -mt-8 size-14 rounded-full bg-primary text-white shadow-lg shadow-primary/30 active:scale-95 transition-transform"
                            >
                                <item.icon size={24} />
                            </Link>
                        );
                    }

                    return (
                        <Link
                            key={item.path}
                            to={item.path}
                            className={clsx(
                                "flex flex-col items-center gap-1 transition-colors w-16", // Fixed width to prevent jitter
                                isActive ? "text-primary" : "text-slate-400 dark:text-[#a19db9]"
                            )}
                        >
                            <item.icon className="!text-2xl mb-0.5" size={24} />
                            <span className={clsx("text-[10px] font-sans tracking-wide", isActive ? "font-bold" : "font-medium")}>
                                {item.label}
                            </span>
                        </Link>
                    );
                })}
            </div>
        </div>
    );
};
