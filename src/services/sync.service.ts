import { App as CapApp } from '@capacitor/app';
import { scraperService } from './scraper.service';

class SyncService {
    private syncInterval: any = null;
    private lastSyncTime: number = 0;
    private readonly SYNC_THRESHOLD = 5 * 60 * 1000; // 5 minutes

    async start() {
        console.log('[SyncService] Starting automatic sync service');

        // 1. Setup periodic sync (every 5 minutes)
        if (this.syncInterval) clearInterval(this.syncInterval);
        this.syncInterval = setInterval(() => {
            this.triggerSync('Periodic');
        }, this.SYNC_THRESHOLD);

        // 2. Setup Resume Sync
        CapApp.addListener('appStateChange', (state) => {
            if (state.isActive) {
                console.log('[SyncService] App resumed, checking for sync...');
                this.triggerSync('Resume');
            }
        });

        // 3. Trigger initial sync on start if needed
        this.triggerSync('Initial');
    }

    private async triggerSync(reason: string) {
        const now = Date.now();
        const timeSinceLastSync = now - this.lastSyncTime;

        // Skip if last sync was too recent (unless it's a periodic trigger which is handled by interval anyway)
        if (reason !== 'Periodic' && timeSinceLastSync < this.SYNC_THRESHOLD) {
            console.log(`[SyncService] Skipping ${reason} sync: last sync was ${Math.round(timeSinceLastSync / 1000)}s ago`);
            return;
        }

        if (scraperService.isScraping) {
            console.log(`[SyncService] Skipping ${reason} sync: scraper is currently busy`);
            return;
        }

        console.log(`[SyncService] Triggering ${reason} sync...`);
        try {
            this.lastSyncTime = now;
            await scraperService.syncAllDiscoverData((task, current, total) => {
                // We don't necessarily need progress UI for background sync, 
                // but scraperService.syncAllDiscoverData will update its own progress state
                console.log(`[SyncService] Progress: ${task} (${current}/${total})`);
            });
            console.log(`[SyncService] ${reason} sync completed successfully`);
            window.dispatchEvent(new CustomEvent('sync-complete'));
        } catch (error) {
            console.error(`[SyncService] ${reason} sync failed:`, error);
        }
    }

    stop() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
    }
}

export const syncService = new SyncService();
