
type UpdateListener = (state: UpdateState) => void;

export interface UpdateState {
    status: 'idle' | 'checking' | 'update-found' | 'downloading' | 'ready' | 'error';
    currentVersion: string;
    latestVersion: string;
    progress: number;
    releaseNotes?: string;
}

export class UpdateService {
    private listeners: UpdateListener[] = [];
    private state: UpdateState = {
        status: 'idle',
        currentVersion: '1.1.0', // Matches build.gradle
        latestVersion: '1.1.0',
        progress: 0
    };

    subscribe(listener: UpdateListener) {
        this.listeners.push(listener);
        listener(this.state);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    private notify() {
        this.listeners.forEach(l => l(this.state));
    }

    async checkForUpdates() {
        if (this.state.status !== 'idle') return;

        this.state.status = 'checking';
        this.notify();

        // Simulate network delay
        await new Promise(r => setTimeout(r, 2000));

        // Mock: Always find an update for demonstration purposes if triggered
        this.state.latestVersion = '1.2.0';
        this.state.releaseNotes = "• Improved AI voice clarity\n• Fixed sticky headers in Settings\n• Added background music persistence\n• Performance optimizations";
        this.state.status = 'update-found';
        this.notify();
    }

    async downloadUpdate() {
        if (this.state.status !== 'update-found') return;

        this.state.status = 'downloading';
        this.state.progress = 0;
        this.notify();

        // Simulate download progress
        for (let i = 0; i <= 100; i += 5) {
            await new Promise(r => setTimeout(r, 150));
            this.state.progress = i;
            this.notify();
        }

        this.state.status = 'ready';
        this.notify();
    }

    async installUpdate() {
        if (this.state.status !== 'ready') return;

        // In a real Capacitor app, this might trigger a plugin to open the APK
        // For now, we simulate a restart
        localStorage.setItem('app_version', this.state.latestVersion);
        alert("Update installed successfully. App will now restart.");
        window.location.reload();
    }
}

export const updateService = new UpdateService();
