import { Link, useLocation } from 'react-router-dom';
import { BookOpen, Compass, Upload, BarChart2, Settings } from 'lucide-react';
import clsx from 'clsx';

export const Navbar = () => {
    const location = useLocation();

    const navItems = [
        { icon: BookOpen, label: 'Library', path: '/' },
        { icon: Compass, label: 'Discover', path: '/discover' },
        { icon: Upload, label: 'Import', path: '/import', primary: true },
        { icon: BarChart2, label: 'AI Audio', path: '/audio' },
        { icon: Settings, label: 'Settings', path: '/settings' },
    ];

    return (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 dark:bg-[#121118]/95 backdrop-blur-md border-t border-slate-200 dark:border-white/5 pb-6 pt-2">
            <div className="flex justify-around items-center px-2">
                {navItems.map((item) => {
                    const isActive = location.pathname === item.path;

                    if (item.primary) {
                        return (
                            <Link
                                key={item.path}
                                to={item.path}
                                className="relative flex flex-col items-center gap-1 -mt-8 size-14 rounded-full bg-primary text-white shadow-lg shadow-primary/30 active:scale-95 transition-transform"
                            >
                                <item.icon className="!text-2xl mt-3.5" size={24} />
                            </Link>
                        );
                    }

                    return (
                        <Link
                            key={item.path}
                            to={item.path}
                            className={clsx(
                                "flex flex-col items-center gap-1 transition-colors",
                                isActive ? "text-primary" : "text-slate-400 dark:text-[#a19db9]"
                            )}
                        >
                            <item.icon className="!text-2xl" size={24} />
                            <span className={clsx("text-[10px]", isActive ? "font-bold" : "font-medium")}>
                                {item.label}
                            </span>
                        </Link>
                    );
                })}
            </div>
        </div>
    );
};
