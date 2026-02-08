
import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';

export interface Notification {
    id: string;
    title: string;
    body: string;
    timestamp: number;
    isRead: boolean;
    type: 'scrape' | 'chapter' | 'system' | 'update';
    icon?: string;
    imageUrl?: string;
    payload?: any;
}

type NotificationListener = (notifications: Notification[]) => void;

export class NotificationService {
    private notifications: Notification[] = [];
    private listeners: NotificationListener[] = [];

    constructor() {
        this.loadNotifications();
        this.setupLocalNotifications();
    }

    private async setupLocalNotifications() {
        if (Capacitor.isNativePlatform()) {
            try {
                const permission = await LocalNotifications.requestPermissions();
                if (permission.display !== 'granted') {
                    console.warn('Local notification permissions not granted');
                }

                // Add click listener
                await LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
                    console.log('Notification action performed', action);
                    // Open the app to the notifications page
                    window.location.hash = '/notifications';
                });
            } catch (e) {
                console.error('Failed to setup local notifications', e);
            }
        }
    }

    private loadNotifications() {
        const saved = localStorage.getItem('notifications');
        if (saved) {
            try {
                this.notifications = JSON.parse(saved);
            } catch (e) {
                console.error('Failed to parse notifications', e);
                this.notifications = [];
            }
        }
    }

    private saveNotifications() {
        localStorage.setItem('notifications', JSON.stringify(this.notifications));
        this.notify();
    }

    subscribe(listener: NotificationListener) {
        this.listeners.push(listener);
        listener(this.notifications);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    private notify() {
        this.listeners.forEach(l => l([...this.notifications]));
    }

    async addNotification(notification: Omit<Notification, 'id' | 'timestamp' | 'isRead'>) {
        const newNotification: Notification = {
            ...notification,
            id: Math.random().toString(36).substr(2, 9),
            timestamp: Date.now(),
            isRead: false
        };

        this.notifications.unshift(newNotification);

        // Keep only last 50 notifications
        if (this.notifications.length > 50) {
            this.notifications = this.notifications.slice(0, 50);
        }

        this.saveNotifications();

        // Trigger native notification
        if (Capacitor.isNativePlatform()) {
            await LocalNotifications.schedule({
                notifications: [
                    {
                        title: newNotification.title,
                        body: newNotification.body,
                        id: Math.floor(Math.random() * 10000),
                        schedule: { at: new Date(Date.now() + 1000) },
                        sound: undefined,
                        attachments: [],
                        actionTypeId: '',
                        extra: null
                    }
                ]
            });
        }
    }

    markAllAsRead() {
        this.notifications = this.notifications.map(n => ({ ...n, isRead: true }));
        this.saveNotifications();
    }

    markAsRead(id: string) {
        this.notifications = this.notifications.map(n =>
            n.id === id ? { ...n, isRead: true } : n
        );
        this.saveNotifications();
    }

    clearAll() {
        this.notifications = [];
        this.saveNotifications();
    }

    getUnreadCount(): number {
        return this.notifications.filter(n => !n.isRead).length;
    }
}

export const notificationService = new NotificationService();
