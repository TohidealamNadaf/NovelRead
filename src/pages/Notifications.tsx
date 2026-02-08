import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, CheckCircle2, BookOpen, Star, RefreshCw, Zap } from 'lucide-react';
import { notificationService } from '../services/notification.service';
import type { Notification } from '../services/notification.service';
import { Navbar } from '../components/Navbar';
import clsx from 'clsx';

export const Notifications = () => {
    const navigate = useNavigate();
    const [notifications, setNotifications] = useState<Notification[]>([]);

    useEffect(() => {
        const unsubscribe = notificationService.subscribe((list) => {
            setNotifications(list);
        });
        return unsubscribe;
    }, []);

    const handleMarkAllRead = () => {
        notificationService.markAllAsRead();
    };

    const isToday = (timestamp: number) => {
        const d = new Date(timestamp);
        const today = new Date();
        return d.getDate() === today.getDate() &&
            d.getMonth() === today.getMonth() &&
            d.getFullYear() === today.getFullYear();
    };

    const todayNotifs = notifications.filter(n => isToday(n.timestamp));
    const earlierNotifs = notifications.filter(n => !isToday(n.timestamp));

    const getIcon = (type: Notification['type']) => {
        switch (type) {
            case 'scrape': return <CheckCircle2 className="text-purple-accent" size={20} />;
            case 'chapter': return <BookOpen className="text-purple-accent" size={20} />;
            case 'update': return <RefreshCw className="text-blue-500" size={20} />;
            case 'system': return <Zap className="text-amber-500" size={20} />;
            default: return <Star className="text-slate-400" size={20} />;
        }
    };

    const getBgColor = (type: Notification['type']) => {
        switch (type) {
            case 'scrape':
            case 'chapter': return 'bg-purple-500/10';
            case 'update': return 'bg-blue-500/10';
            case 'system': return 'bg-amber-500/10';
            default: return 'bg-slate-500/10';
        }
    };

    const formatTime = (timestamp: number) => {
        const diff = Date.now() - timestamp;
        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        return new Date(timestamp).toLocaleDateString();
    };

    const NotificationCard = ({ n }: { n: Notification }) => (
        <div
            onClick={() => notificationService.markAsRead(n.id)}
            className={clsx(
                "relative overflow-hidden bg-white dark:bg-[#1c1c1e] p-4 border-b border-slate-100 dark:border-white/5 active:bg-slate-50 dark:active:bg-[#252529] transition-colors cursor-pointer",
                !n.isRead ? "opacity-100" : "opacity-70"
            )}
        >
            {!n.isRead && <div className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-primary" />}
            <div className="flex gap-4">
                {n.imageUrl ? (
                    <div className="relative flex-shrink-0 w-16 h-24 rounded-lg overflow-hidden shadow-lg border border-white/10 bg-slate-200 dark:bg-slate-800">
                        <img alt="Book Cover" className="w-full h-full object-cover" src={n.imageUrl} />
                    </div>
                ) : (
                    <div className={clsx("flex size-10 items-center justify-center rounded-xl flex-shrink-0", getBgColor(n.type))}>
                        {getIcon(n.type)}
                    </div>
                )}

                <div className="flex-1 flex flex-col justify-between py-0.5">
                    <div>
                        <div className="flex justify-between items-start mb-1">
                            <span className={clsx("text-[11px] font-bold uppercase tracking-wide",
                                n.type === 'scrape' || n.type === 'chapter' ? "text-purple-accent" :
                                    n.type === 'system' ? "text-amber-500" : "text-blue-500"
                            )}>
                                {n.type.replace('-', ' ')}
                            </span>
                            <span className="text-[11px] text-slate-500">{formatTime(n.timestamp)}</span>
                        </div>
                        <h3 className="text-[15px] font-semibold leading-tight mb-1 dark:text-white">{n.title}</h3>
                        <p className="text-[13px] text-slate-500 dark:text-slate-400 line-clamp-2">{n.body}</p>
                    </div>
                    {n.type === 'scrape' && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                if (n.payload?.novelId) navigate(`/novel/${n.payload.novelId}`);
                            }}
                            className="w-fit mt-3 px-4 py-1.5 bg-primary text-white text-[12px] font-bold rounded-full shadow-lg shadow-primary/20 active:scale-95 transition-transform"
                        >
                            Read Now
                        </button>
                    )}
                </div>
            </div>
        </div>
    );

    return (
        <div className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-white min-h-screen font-display flex flex-col">
            <div className="sticky top-0 z-30 bg-background-light/90 dark:bg-background-dark/90 backdrop-blur-xl border-b border-slate-200 dark:border-white/5 pt-[18px]">
                <div className="flex items-center justify-between h-14 px-4">
                    <button onClick={() => navigate(-1)} className="flex items-center text-primary active:opacity-60 transition-opacity">
                        <ChevronLeft size={32} />
                    </button>
                    <h1 className="text-lg font-bold">Notifications</h1>
                    <button
                        onClick={handleMarkAllRead}
                        className="text-[14px] font-semibold text-primary active:opacity-60 transition-opacity"
                    >
                        Mark all as read
                    </button>
                </div>
            </div>

            <div className="flex-1 pb-48">
                {notifications.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-12 text-center opacity-50">
                        <Bell size={48} className="mb-4 text-slate-400" />
                        <p className="font-medium">No alerts yet</p>
                        <p className="text-sm">Your scraping updates will appear here.</p>
                        <button
                            onClick={async () => {
                                // Demo notification
                                await notificationService.addNotification({
                                    title: "Welcome to Notifications",
                                    body: "You'll get updates here for scrapings and new chapters.",
                                    type: 'system'
                                });
                            }}
                            className="mt-6 text-primary font-bold text-sm"
                        >
                            Send Test Notification
                        </button>
                    </div>
                ) : (
                    <>
                        {todayNotifs.length > 0 && (
                            <>
                                <h2 className="ios-section-title">Today</h2>
                                <div className="flex flex-col">
                                    {todayNotifs.map(n => <NotificationCard key={n.id} n={n} />)}
                                </div>
                            </>
                        )}

                        {earlierNotifs.length > 0 && (
                            <>
                                <h2 className="ios-section-title">Earlier</h2>
                                <div className="flex flex-col">
                                    {earlierNotifs.map(n => <NotificationCard key={n.id} n={n} />)}
                                </div>
                            </>
                        )}

                        <div className="p-6 flex justify-center">
                            <button
                                onClick={() => notificationService.clearAll()}
                                className="text-slate-400 hover:text-red-500 text-xs font-semibold uppercase tracking-widest transition-colors"
                            >
                                Clear All Notifications
                            </button>
                        </div>
                    </>
                )}
            </div>

            <Navbar />
        </div>
    );
};

// Help Lucide find Bell if used in empty state
const Bell = ({ className, size }: { className?: string, size?: number }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size || 24}
        height={size || 24}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
    >
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
);
