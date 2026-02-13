import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, BookOpen, Star, RefreshCw, Zap, Bell, Trash2, Check } from 'lucide-react';
import { notificationService } from '../services/notification.service';
import type { Notification } from '../services/notification.service';
import { FooterNavigation } from '../components/FooterNavigation';
import { Header } from '../components/Header';
import clsx from 'clsx';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

export const Notifications = () => {
    const navigate = useNavigate();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [showClearConfirm, setShowClearConfirm] = useState(false);
    const parentRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const unsubscribe = notificationService.subscribe((list) => {
            setNotifications(list);
        });
        return unsubscribe;
    }, []);

    const rowVirtualizer = useVirtualizer({
        count: notifications.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 100, // Estimate height
        overscan: 5,
    });

    const handleMarkAllRead = async () => {
        notificationService.markAllAsRead();
        if (Capacitor.isNativePlatform()) {
            await Haptics.impact({ style: ImpactStyle.Light });
        }
    };

    const handleClearAll = async () => {
        notificationService.clearAll();
        setShowClearConfirm(false);
        if (Capacitor.isNativePlatform()) {
            await Haptics.impact({ style: ImpactStyle.Medium });
        }
    };

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

    const NotificationItem = ({ n }: { n: Notification }) => (
        <div
            onClick={() => notificationService.markAsRead(n.id)}
            className={clsx(
                "relative overflow-hidden bg-white dark:bg-[#1c1c1e] p-4 border-b border-slate-100 dark:border-white/5 active:bg-slate-50 dark:active:bg-[#252529] transition-colors cursor-pointer",
                !n.isRead && "bg-blue-50/50 dark:bg-blue-900/10" // Unread highlight background
            )}
        >
            {!n.isRead && <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />} {/* Unread stripe */}

            <div className="flex gap-4">
                {n.imageUrl ? (
                    <div className="relative flex-shrink-0 w-16 h-24 rounded-lg overflow-hidden shadow-sm border border-black/5 dark:border-white/10 bg-slate-200 dark:bg-slate-800">
                        <img alt="Cover" className="w-full h-full object-cover" src={n.imageUrl} loading="lazy" />
                    </div>
                ) : (
                    <div className={clsx("flex size-10 items-center justify-center rounded-xl flex-shrink-0", getBgColor(n.type))}>
                        {getIcon(n.type)}
                    </div>
                )}

                <div className="flex-1 flex flex-col justify-start py-0.5 min-w-0">
                    <div className="flex justify-between items-start mb-1 gap-2">
                        <span className={clsx("text-[11px] font-bold uppercase tracking-wide truncate",
                            n.type === 'scrape' || n.type === 'chapter' ? "text-purple-accent" :
                                n.type === 'system' ? "text-amber-500" : "text-blue-500"
                        )}>
                            {n.type.replace('-', ' ')}
                        </span>
                        <span className="text-[11px] text-slate-500 whitespace-nowrap">{formatTime(n.timestamp)}</span>
                    </div>
                    <h3 className={clsx("text-[15px] leading-tight mb-1 dark:text-white truncate pr-2", !n.isRead ? "font-bold" : "font-semibold")}>{n.title}</h3>
                    <p className="text-[13px] text-slate-500 dark:text-slate-400 line-clamp-2 md:line-clamp-3 leading-snug">{n.body}</p>

                    {n.type === 'scrape' && typeof n.payload?.novelId === 'string' && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                const novelId = n.payload!.novelId as string;
                                const category = (n.payload as any).category;
                                const baseRoute = category === 'Manhwa' ? '/manhwa' : '/novel';
                                navigate(`${baseRoute}/${novelId}`);
                            }}
                            className="w-fit mt-3 px-4 py-1.5 bg-primary/10 text-primary text-[12px] font-bold rounded-full hover:bg-primary/20 transition-colors"
                        >
                            Read Now
                        </button>
                    )}
                </div>
            </div>
        </div>
    );

    return (
        <div className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-white h-screen font-display flex flex-col">
            <Header
                title="Notifications"
                showBack
                rightActions={
                    notifications.length > 0 && (
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setShowClearConfirm(true)}
                                className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                            >
                                <Trash2 size={18} />
                            </button>
                            <button
                                onClick={handleMarkAllRead}
                                className="p-2 text-primary hover:opacity-80 transition-opacity"
                                title="Mark all as read"
                            >
                                <Check size={20} />
                            </button>

                        </div>
                    )
                }
                withBorder
            />

            <div ref={parentRef} className="flex-1 overflow-y-auto w-full pb-24 relative">
                {notifications.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-12 text-center opacity-50 h-full">
                        <Bell size={48} className="mb-4 text-slate-400" />
                        <p className="font-medium">No alerts yet</p>
                        <p className="text-sm mt-1">Your scraping updates will appear here.</p>
                    </div>
                ) : (
                    <div
                        style={{
                            height: `${rowVirtualizer.getTotalSize()}px`,
                            width: '100%',
                            position: 'relative',
                        }}
                    >
                        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                            const n = notifications[virtualRow.index];
                            return (
                                <div
                                    key={n.id}
                                    style={{
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        width: '100%',
                                        height: `${virtualRow.size}px`,
                                        transform: `translateY(${virtualRow.start}px)`,
                                    }}
                                >
                                    <NotificationItem n={n} />
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Clear Confirm Modal/Overlay */}
            {showClearConfirm && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in p-4">
                    <div className="bg-white dark:bg-[#1e1e24] w-full max-w-sm rounded-2xl p-6 shadow-2xl border border-white/10 scale-100 animate-in zoom-in-95 duration-200">
                        <div className="flex flex-col items-center text-center">
                            <div className="size-12 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center mb-4">
                                <Trash2 size={24} />
                            </div>
                            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Clear Notifications?</h3>
                            <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">
                                This action cannot be undone. All your notifications will be permanently removed.
                            </p>
                            <div className="grid grid-cols-2 gap-3 w-full">
                                <button
                                    onClick={() => setShowClearConfirm(false)}
                                    className="px-4 py-2.5 rounded-xl font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleClearAll}
                                    className="px-4 py-2.5 rounded-xl font-semibold bg-red-500 text-white hover:bg-red-600 transition-colors shadow-lg shadow-red-500/20"
                                >
                                    Yes, Clear
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <FooterNavigation />
        </div>
    );
};
