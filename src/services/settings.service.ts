
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

    // AI Audio
    ttsVoice: string | null;
    ttsRate: number;
    ttsPitch: number;
    ambience: 'rainy' | 'fireplace' | 'forest' | null;
    isMusicEnabled: boolean;
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
    cloudSync: true,
    ttsVoice: null,
    ttsRate: 1.2,
    ttsPitch: 0,
    ambience: null,
    isMusicEnabled: true
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
        if (theme === 'dark') {
            root.classList.add('dark');
        } else {
            root.classList.remove('dark');
        }
    }
}

export const settingsService = new SettingsService();
