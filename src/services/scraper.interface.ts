import type { HomeData, NovelMetadata } from './scraper.service';

export interface INovelScraper {
    searchNovels(query: string): Promise<NovelMetadata[]>;
    syncDiscoverData(onProgress?: (task: string, current: number, total: number) => void): Promise<HomeData>;
    fetchNovel(url: string, userProvidedChapters?: boolean): Promise<NovelMetadata>;
    fetchNovelFast(url: string, onProgress?: (chapters: { title: string; url: string; date?: string }[], page: number, metadata?: Partial<NovelMetadata>) => void): Promise<NovelMetadata>;
    fetchChapterContent(url: string): Promise<string>;
    
    // Category list fetchers
    fetchRanking?(type?: string | number, page?: number): Promise<NovelMetadata[]>;
    fetchLatest?(page?: number): Promise<NovelMetadata[]>;
    fetchRecentlyAdded?(page?: number): Promise<NovelMetadata[]>;
    fetchCompleted?(page?: number): Promise<NovelMetadata[]>;
}
