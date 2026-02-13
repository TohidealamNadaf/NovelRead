
import { Preferences } from '@capacitor/preferences';

const SETTINGS_KEY = 'app_settings';

export type Listener = (settings: AppSettings) => void;

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
    voiceVolume: number;
    bgmVolume: number;
    autoNextChapter: boolean;
    sleepTimer: number; // in minutes, 0 = off
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
    isMusicEnabled: true,
    voiceVolume: 100,
    bgmVolume: 35,
    autoNextChapter: false,
    sleepTimer: 0
};

class SettingsService {
    private settings: AppSettings = DEFAULT_SETTINGS;
    private listeners: Listener[] = [];
    private loaded = false;

    constructor() {
        this.loadSettings();
    }

    private async loadSettings() {
        try {
            const { value } = await Preferences.get({ key: SETTINGS_KEY });
            if (value) {
                this.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(value) };
            }
            this.notify();
            this.loaded = true;
            this.applyTheme();
        } catch (e) {
            console.error("Failed to load settings", e);
        }
    }

    async updateSettings(newSettings: Partial<AppSettings>) {
        this.settings = { ...this.settings, ...newSettings };
        this.notify();
        this.applyTheme();
        await this.saveSettings();
    }

    private async saveSettings() {
        try {
            await Preferences.set({
                key: SETTINGS_KEY,
                value: JSON.stringify(this.settings)
            });
        } catch (e) {
            console.error("Failed to save settings", e);
        }
    }

    getSettings() {
        return this.settings;
    }

    subscribe(listener: Listener) {
        this.listeners.push(listener);
        if (this.loaded) listener(this.settings);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    private notify() {
        this.listeners.forEach(l => l({ ...this.settings }));
    }

    private applyTheme() {
        const root = document.documentElement;
        if (this.settings.theme === 'dark') {
            root.classList.add('dark');
        } else {
            root.classList.remove('dark');
        }
    }
}

export const settingsService = new SettingsService();
