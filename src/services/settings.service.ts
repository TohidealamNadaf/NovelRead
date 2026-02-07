
type Listener = (settings: AppSettings) => void;

export interface AppSettings {
    theme: 'light' | 'dark' | 'sepia' | 'oled';
    language: 'en' | 'es' | 'fr' | 'zh';

    // Reading Preferences
    fontSize: number;
    fontFamily: 'serif' | 'sans' | 'comfortable';
    autoScroll: boolean;
    pageFlipAnimation: boolean;

    // System
    downloadLocation: 'internal' | 'external';
    scraperProxy: string | null;
    cloudSync: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
    theme: 'dark',
    language: 'en',
    fontSize: 1.125,
    fontFamily: 'serif',
    autoScroll: true,
    pageFlipAnimation: false,
    downloadLocation: 'internal',
    scraperProxy: null,
    cloudSync: true
};

export class SettingsService {
    private settings: AppSettings;
    private listeners: Listener[] = [];

    constructor() {
        const saved = localStorage.getItem('app_settings');
        this.settings = saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
        this.applyTheme(this.settings.theme);
    }

    getSettings(): AppSettings {
        return { ...this.settings };
    }

    updateSettings(newSettings: Partial<AppSettings>) {
        this.settings = { ...this.settings, ...newSettings };
        localStorage.setItem('app_settings', JSON.stringify(this.settings));

        if (newSettings.theme) this.applyTheme(newSettings.theme);
        this.notify();
    }

    subscribe(listener: Listener) {
        this.listeners.push(listener);
        listener(this.settings);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    private notify() {
        this.listeners.forEach(l => l(this.settings));
    }

    private applyTheme(theme: string) {
        const root = document.documentElement;
        root.classList.remove('dark', 'light', 'sepia', 'oled');

        if (theme === 'light') {
            // Default light
        } else {
            root.classList.add('dark');
        }
        // Additional classes can be handled by components observing the state
    }
}

export const settingsService = new SettingsService();
