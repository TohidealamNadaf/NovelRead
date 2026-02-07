import { useNavigate, useLocation } from 'react-router-dom';
import { Library, Compass, Upload, Music, User } from 'lucide-react';
import clsx from 'clsx';

export const BottomNav = () => {
    const navigate = useNavigate();
    const location = useLocation();

    const navItems = [
        { icon: Library, label: 'Library', path: '/' },
        { icon: Compass, label: 'Discover', path: '/discover' },
        { icon: Upload, label: 'Import', path: '/import', primary: true },
        { icon: Music, label: 'AI Audio', path: '/audio' },
        { icon: User, label: 'Profile', path: '/profile' },
    ];

    return (
        <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 dark:bg-[#121118]/95 backdrop-blur-md border-t border-slate-200 dark:border-white/5 pb-6 pt-2">
            <div className="flex justify-around items-center px-2">
                {navItems.map((item) => {
                    const isActive = location.pathname === item.path;

                    if (item.primary) {
                        return (
                            <div className="relative -top-6" key={item.path}>
                                <button
                                    onClick={() => navigate(item.path)}
                                    className="size-14 bg-primary rounded-full shadow-lg shadow-primary/30 flex items-center justify-center text-white ring-4 ring-background-light dark:ring-background-dark active:scale-95 transition-transform"
                                >
                                    <item.icon size={28} />
                                </button>
                            </div>
                        );
                    }

                    return (
                        <button
                            key={item.path}
                            onClick={() => navigate(item.path)}
                            className={clsx(
                                "flex flex-col items-center gap-1 transition-colors",
                                isActive ? "text-primary" : "text-slate-400 dark:text-[#a19db9]"
                            )}
                        >
                            <item.icon className={clsx("!text-2xl", isActive && "fill-current")} size={24} />
                            <span className={clsx("text-[10px]", isActive ? "font-bold" : "font-medium")}>
                                {item.label}
                            </span>
                        </button>
                    );
                })}
            </div>
        </nav>
    );
};
