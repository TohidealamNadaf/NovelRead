export interface AppSettings {
    theme: 'light' | 'dark' | 'sepia' | 'oled';
    fontSize: number;
    fontFamily: 'serif' | 'sans' | 'display';
    autoScrollSpeed: number;
    ttsVoice: string;
    ttsRate: number;
}

const DEFAULT_SETTINGS: AppSettings = {
    theme: 'dark',
    fontSize: 18,
    fontFamily: 'serif',
    autoScrollSpeed: 0,
    ttsVoice: '',
    ttsRate: 1.0
};

export class SettingsService {
    private settings: AppSettings;

    constructor() {
        const saved = localStorage.getItem('app_settings');
        this.settings = saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
        this.applyTheme(this.settings.theme);
    }

    getSettings(): AppSettings {
        return { ...this.settings };
    }

    updateSettings(newSettings: Partial<AppSettings>) {
        this.settings = { ...this.settings, ...newSettings };
        localStorage.setItem('app_settings', JSON.stringify(this.settings));

        if (newSettings.theme) this.applyTheme(newSettings.theme);
    }

    private applyTheme(theme: string) {
        document.documentElement.classList.remove('dark', 'sepia', 'oled');
        if (theme === 'dark' || theme === 'oled') {
            document.documentElement.classList.add('dark');
        }
        // Additional theme logic handled by CSS classes on reader component
    }
}

export const settingsService = new SettingsService();
