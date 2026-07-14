import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { dbService } from './db.service';
import { notificationService } from './notification.service';
import { FreeWebNovelScraper } from './freewebnovel.scraper';
import { NovelFireScraper } from './novelfire.scraper';
import type { INovelScraper } from './scraper.interface';

export interface NovelMetadata {
    title: string;
    author: string;
    coverUrl: string;
    summary?: string;
    status?: string;
    category?: string;
    chapters: ScrapedChapter[];
    sourceUrl?: string; // For search results to link back to source
    sourceId?: string; // Original ID from source
    totalChapters?: number;
    complete?: boolean;
}

export type ScrapedChapter = { title: string; url: string; date?: string };

export interface HomeData {
    recommended: NovelMetadata[];
    ranking: NovelMetadata[];
    latest: NovelMetadata[];
    recentlyAdded: NovelMetadata[];
    completed: NovelMetadata[];
}

export interface ScraperProgress {
    current: number;
    total: number;
    currentTitle: string;
    logs: string[];
}

export class ScraperService {
    private isScrapingInternal = false;
    private currentProgress: ScraperProgress = { current: 0, total: 0, currentTitle: '', logs: [] };
    private activeNovel: NovelMetadata | null = null;
    private listeners: ((progress: ScraperProgress, isScraping: boolean) => void)[] = [];
    
    private novelfireScraper = new NovelFireScraper();
    private freewebnovelScraper = new FreeWebNovelScraper();

    // In-memory cache for live reading and prefetching
    // Ensures quick back/forth navigation and instant prefetch resolution
    private chapterCache = new Map<string, { content: string, timestamp: number }>();
    private pendingFetches = new Map<string, Promise<string>>();
    private chapterListCache = new Map<string, { data: NovelMetadata; t: number }>();

    get isScraping() { return this.isScrapingInternal; }
    get progress() { return this.currentProgress; }
    get activeNovelMetadata() { return this.activeNovel; }

    subscribe(listener: (progress: ScraperProgress, isScraping: boolean) => void) {
        this.listeners.push(listener);
        listener(this.currentProgress, this.isScrapingInternal);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    resetProgress() {
        this.currentProgress = { current: 0, total: 0, currentTitle: '', logs: [] };
        this.clearMetadata();
        this.notifyListeners();
    }

    clearMetadata() {
        this.activeNovel = null;
    }

    private notifyListeners() {
        this.listeners.forEach(l => l(this.currentProgress, this.isScrapingInternal));
    }

    private getScraper(urlOrSource: string): INovelScraper {
        if (urlOrSource.includes('freewebnovel.com') || urlOrSource === 'freewebnovel') {
            return this.freewebnovelScraper;
        }
        // Default to novelfire
        return this.novelfireScraper;
    }

    async searchNovels(query: string, source: 'novelfire' | 'freewebnovel' = 'novelfire'): Promise<NovelMetadata[]> {
        return this.getScraper(source).searchNovels(query);
    }

    async syncAllDiscoverData(onProgress?: (task: string, current: number, total: number) => void, source: 'novelfire' | 'freewebnovel' = 'novelfire'): Promise<HomeData> {
        return this.getScraper(source).syncDiscoverData(onProgress);
    }

    async fetchNovelFast(
        url: string,
        onProgress?: (chapters: { title: string; url: string; date?: string }[], page: number, metadata?: Partial<NovelMetadata>) => void,
        knownChapterCount: number = 0,
        signal?: AbortSignal
    ): Promise<NovelMetadata> {
        // Skip cache if we have known chapters (incremental sync) or signal (fresh fetch)
        if (knownChapterCount === 0 && !signal) {
            const cached = this.chapterListCache.get(url);
            if (cached && Date.now() - cached.t < 10 * 60 * 1000) {  // 10min
                onProgress?.(cached.data.chapters, 1, cached.data);
                return cached.data;
            }
        }
        
        const data = await this.getScraper(url).fetchNovelFast(url, onProgress, knownChapterCount, signal);
        
        if (knownChapterCount === 0 && !signal) {
            this.chapterListCache.set(url, { data, t: Date.now() });
        }
        
        return data;
    }

    async fetchNovel(url: string, userProvidedChapters?: boolean): Promise<NovelMetadata> {
        return this.getScraper(url).fetchNovel(url, userProvidedChapters);
    }

    async fetchChapterContent(url: string): Promise<string> {
        // Return from cache if fetched within the last 30 minutes
        const cached = this.chapterCache.get(url);
        if (cached && Date.now() - cached.timestamp < 30 * 60 * 1000) {
            return cached.content;
        }

        if (this.pendingFetches.has(url)) {
            return this.pendingFetches.get(url)!;
        }

        const fetchPromise = (async () => {
            const content = await this.getScraper(url).fetchChapterContent(url);
            
            // Save to cache and restrict size to ~20 chapters
            this.chapterCache.set(url, { content, timestamp: Date.now() });
            if (this.chapterCache.size > 20) {
                const oldestKey = this.chapterCache.keys().next().value;
                if (oldestKey) this.chapterCache.delete(oldestKey);
            }

            return content;
        })().finally(() => {
            this.pendingFetches.delete(url);
        });

        this.pendingFetches.set(url, fetchPromise);
        return fetchPromise;
    }

    enhanceContent(html: string): string {
        return this.novelfireScraper.enhanceContent(html);
    }

    async fetchRanking(type: string = 'overall', page: number = 1, source: string = 'novelfire'): Promise<NovelMetadata[]> {
        const scraper = this.getScraper(source);
        return scraper.fetchRanking ? scraper.fetchRanking(type, page) : [];
    }

    async fetchLatest(page: number = 1, source: string = 'novelfire'): Promise<NovelMetadata[]> {
        const scraper = this.getScraper(source);
        return scraper.fetchLatest ? scraper.fetchLatest(page) : [];
    }

    async fetchRecentlyAdded(page: number = 1, source: string = 'novelfire'): Promise<NovelMetadata[]> {
        const scraper = this.getScraper(source);
        return scraper.fetchRecentlyAdded ? scraper.fetchRecentlyAdded(page) : [];
    }

    async fetchCompleted(page: number = 1, source: string = 'novelfire'): Promise<NovelMetadata[]> {
        const scraper = this.getScraper(source);
        return scraper.fetchCompleted ? scraper.fetchCompleted(page) : [];
    }

    private async updateNotification(novelTitle: string) {
        if (Capacitor.getPlatform() === 'web') return;

        const percentage = Math.round((this.currentProgress.current / this.currentProgress.total) * 100);

        try {
            await LocalNotifications.schedule({
                notifications: [{
                    id: 1001,
                    title: `Importing: ${novelTitle}`,
                    body: `Progress: ${this.currentProgress.current}/${this.currentProgress.total} chapters (${percentage}%)`,
                    largeBody: `Currently scraping: ${this.currentProgress.currentTitle}`,
                    ongoing: true,
                    autoCancel: false,
                    silent: true,
                    schedule: { at: new Date(Date.now() + 100) }
                }]
            });
        } catch (e) {
            console.error("Failed to update notification", e);
        }
    }

    private async finishNotification(novelTitle: string, success: boolean, customMessage?: string, novelId?: string) {
        if (Capacitor.isNativePlatform()) {
            try {
                await LocalNotifications.cancel({ notifications: [{ id: 1001 }] });
                await LocalNotifications.schedule({
                    notifications: [{
                        id: 1002,
                        title: success ? 'Import Success!' : 'Import Failed',
                        body: customMessage || (success ? `Successfully imported ${novelTitle}` : `Failed to import ${novelTitle}`),
                        schedule: { at: new Date(Date.now() + 100) }
                    }]
                });
            } catch (e) {
                console.error("Failed to finish notification", e);
            }
        }

        await notificationService.addNotification({
            title: success ? 'Scrape Complete' : 'Scrape Failed',
            body: customMessage || (success ? `Successfully imported ${novelTitle}` : `Failed to import ${novelTitle}`),
            type: 'scrape',
            imageUrl: this.activeNovel?.coverUrl,
            payload: {
                novelId: novelId || this.activeNovel?.title.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '-').toLowerCase().slice(0, 24),
                category: 'Novel'
            }
        });
    }

    async startImport(url: string, novel: NovelMetadata, category: string = 'Imported') {
        if (this.isScrapingInternal) return;

        this.isScrapingInternal = true;
        this.activeNovel = novel;
        this.currentProgress = { current: 0, total: novel.chapters.length, currentTitle: 'Starting...', logs: [] };
        this.notifyListeners();

        let novelId = '';
        if (url) {
            const path = url.replace(/https?:\/\/[^\/]+/, '').replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
            novelId = `live-${path}`.slice(0, 80);
        } else {
            novelId = novel.title.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '-').toLowerCase().slice(0, 24) + '-' + Math.random().toString(36).slice(2, 7);
        }

        try {
            await dbService.initialize();

            await dbService.addNovel({
                id: novelId,
                title: novel.title,
                author: novel.author,
                coverUrl: novel.coverUrl,
                sourceUrl: url,
                category: category,
                totalChapters: novel.totalChapters || novel.chapters.length
            });

            await this.scrapeChapterLoop(novelId, novel.chapters, novel.title, 0);

            await this.finishNotification(novel.title, true, `Successfully imported ${novel.title}`, novelId);
        } catch (error) {
            console.error("Scraping failed", error);
            this.currentProgress.logs.unshift(`[ERROR] ${error instanceof Error ? error.message : String(error)}`);
            await this.finishNotification(novel.title, false, `Failed to import ${novel.title}`, novelId);
        } finally {
            this.isScrapingInternal = false;
            this.notifyListeners();
        }
    }

    async syncNovel(novelId: string, sourceUrl: string, existingChaptersCount: number) {
        if (this.isScrapingInternal) return;

        this.isScrapingInternal = true;
        this.currentProgress = { current: 0, total: 1, currentTitle: 'Checking for updates...', logs: [] };
        this.notifyListeners();

        try {
            const updatedNovel = await this.fetchNovel(sourceUrl);
            this.activeNovel = updatedNovel;

            const newChapters = updatedNovel.chapters.slice(existingChaptersCount);

            if (newChapters.length === 0) {
                this.currentProgress.logs.unshift("No new chapters found.");
                this.notifyListeners();
                await this.finishNotification(updatedNovel.title, true, "No new chapters found.", novelId);
                return;
            }

            this.currentProgress = {
                current: 0,
                total: newChapters.length,
                currentTitle: `Found ${newChapters.length} new chapters`,
                logs: [`Syncing ${newChapters.length} new chapters...`]
            };
            this.notifyListeners();

            await this.scrapeChapterLoop(novelId, newChapters, updatedNovel.title, existingChaptersCount);
            await this.finishNotification(updatedNovel.title, true, `Synced ${newChapters.length} new chapters`, novelId);
        } catch (error) {
            console.error("Sync failed", error);
            this.currentProgress.logs.unshift(`[SYNC ERROR] ${error instanceof Error ? error.message : String(error)}`);
            await this.finishNotification("Sync", false, `Failed to sync novel`, novelId);
        } finally {
            this.isScrapingInternal = false;
            this.notifyListeners();
        }
    }

    async downloadAll(novelId: string, novelTitle: string, chaptersToDownload: { title: string; url: string; audioPath?: string }[]) {
        if (this.isScrapingInternal) return;

        this.isScrapingInternal = true;
        this.currentProgress = { current: 0, total: chaptersToDownload.length, currentTitle: 'Starting downloads...', logs: [] };
        this.notifyListeners();

        try {
            await this.scrapeChapterLoop(novelId, chaptersToDownload, novelTitle);
            await this.finishNotification(novelTitle, true, `Downloaded ${chaptersToDownload.length} chapters`, novelId);
        } catch (error) {
            console.error("Bulk download failed", error);
            this.currentProgress.logs.unshift(`[DOWNLOAD ERROR] ${error instanceof Error ? error.message : String(error)}`);
            await this.finishNotification(novelTitle, false, `Failed to download chapters for ${novelTitle}`, novelId);
        } finally {
            this.isScrapingInternal = false;
            this.notifyListeners();
        }
    }

    private async scrapeChapterLoop(novelId: string, chapters: { title: string; url: string; audioPath?: string }[], novelTitle: string, offset: number = 0) {
        const BATCH_SIZE = 2;

        for (let i = 0; i < chapters.length; i += BATCH_SIZE) {
            const batch = chapters.slice(i, i + BATCH_SIZE);

            await Promise.all(batch.map(async (ch, batchIndex) => {
                const globalIndex = i + batchIndex;
                const currentIndex = offset + globalIndex + 1;

                const exists = await dbService.isChapterExists(novelId, ch.url);
                if (exists) {
                    console.log(`[Scraper] Skipping existing chapter: ${ch.title}`);
                    this.currentProgress = {
                        ...this.currentProgress,
                        current: currentIndex,
                        currentTitle: `Skipping: ${ch.title}`
                    };
                    this.notifyListeners();
                    return;
                }

                const newLogs = [`[${new Date().toLocaleTimeString()}] Fetching: ${ch.title}`, ...this.currentProgress.logs];
                if (newLogs.length > 50) newLogs.pop();

                this.currentProgress = {
                    ...this.currentProgress,
                    current: currentIndex,
                    currentTitle: ch.title,
                    logs: newLogs
                };
                this.notifyListeners();
                await this.updateNotification(novelTitle);

                try {
                    const content = await this.fetchChapterContent(ch.url);

                    if (content && content.length > 50) {
                        const chapterData = {
                            id: `${novelId}-ch-${currentIndex}`,
                            novelId,
                            title: ch.title,
                            content,
                            orderIndex: offset + globalIndex,
                            audioPath: ch.url
                        };
                        await dbService.addChapter(chapterData);

                        const updatedLogs = [...this.currentProgress.logs];
                        updatedLogs[0] = `[${new Date().toLocaleTimeString()}] ${ch.title}: DONE`;
                        this.currentProgress = { ...this.currentProgress, logs: updatedLogs };
                    } else {
                        const updatedLogs = [...this.currentProgress.logs];
                        updatedLogs[0] = `[${new Date().toLocaleTimeString()}] ${ch.title}: FAILED (Empty Content)`;
                        this.currentProgress = { ...this.currentProgress, logs: updatedLogs };
                    }
                } catch (e) {
                    console.error(`Failed to scrape ${ch.title}`, e);
                    const updatedLogs = [...this.currentProgress.logs];
                    updatedLogs[0] = `[${new Date().toLocaleTimeString()}] ${ch.title}: ERROR`;
                    this.currentProgress = { ...this.currentProgress, logs: updatedLogs };
                }
                this.notifyListeners();
            }));

            if (i + BATCH_SIZE < chapters.length) {
                await new Promise(resolve => setTimeout(resolve, 2500));
            }
        }
    }
}

export const scraperService = new ScraperService();
