import { Capacitor } from '@capacitor/core';
import type { NovelMetadata } from '../scraper.service';

const BASE_URL = 'https://api.mangadex.org';

interface MangaDexManga {
    id: string;
    attributes: {
        title: Record<string, string>;
        description: Record<string, string>;
        status: string;
        fileName?: string; // from cover_art relationship
    };
    relationships: {
        type: string;
        id: string;
        attributes?: {
            fileName?: string;
            name?: string;
        };
    }[];
}

interface MangaDexChapter {
    id: string;
    attributes: {
        title: string;
        chapter: string;
        pages: number;
        publishAt: string;
    };
    relationships: {
        type: string;
        id: string;
        attributes?: {
            name: string;
        };
    }[];
}

export class MangaDexService {
    async searchManga(query: string): Promise<NovelMetadata[]> {
        const url = `${BASE_URL}/manga?title=${encodeURIComponent(query)}&limit=20&includes[]=cover_art&includes[]=author&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica&order[relevance]=desc`;

        try {
            const data = await this.fetchJson(url);
            if (!data || !data.data) return [];

            return data.data.map((manga: MangaDexManga) => this.mapMangaToMetadata(manga));
        } catch (error) {
            console.error('MangaDex Search Error:', error);
            return [];
        }
    }

    async fetchMangaDetails(id: string): Promise<NovelMetadata | null> {
        const url = `${BASE_URL}/manga/${id}?includes[]=cover_art&includes[]=author`;
        try {
            const data = await this.fetchJson(url);
            if (!data || !data.data) return null;

            const metadata = this.mapMangaToMetadata(data.data);

            // Fetch chapters
            const chapters = await this.fetchChapters(id);
            metadata.chapters = chapters;

            return metadata;
        } catch (error) {
            console.error('MangaDex Details Error:', error);
            return null;
        }
    }

    async fetchChapters(mangaId: string): Promise<{ title: string; url: string; date?: string }[]> {
        // Fetch all English chapters, sorted ascending
        const url = `${BASE_URL}/manga/${mangaId}/feed?translatedLanguage[]=en&order[chapter]=asc&limit=500&includes[]=scanlation_group`;

        try {
            const data = await this.fetchJson(url);
            if (!data || !data.data) return [];

            return data.data.map((ch: MangaDexChapter) => {
                const chapNum = ch.attributes.chapter || 'Oneshot';
                const title = ch.attributes.title ? ` - ${ch.attributes.title}` : '';

                // Get group name
                const group = ch.relationships.find(r => r.type === 'scanlation_group')?.attributes?.name;
                const groupSuffix = group ? ` [${group}]` : '';

                // Format date
                const date = ch.attributes.publishAt
                    ? new Date(ch.attributes.publishAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
                    : undefined;

                return {
                    title: `Ch. ${chapNum}${title}${groupSuffix}`,
                    url: `https://mangadex.org/chapter/${ch.id}`,
                    date
                };
            });
        } catch (error) {
            console.error('MangaDex Chapters Error:', error);
            return [];
        }
    }

    async fetchChapterImages(chapterId: string): Promise<string[]> {
        try {
            const url = `${BASE_URL}/at-home/server/${chapterId}`;
            const data = await this.fetchJson(url);

            if (data && data.baseUrl && data.chapter && data.chapter.hash && data.chapter.data) {
                const hash = data.chapter.hash;
                const images = data.chapter.data;
                const baseUrl = data.baseUrl;

                return images.map((img: string) => `${baseUrl}/data/${hash}/${img}`);
            }
            return [];
        } catch (error) {
            console.error('MangaDex Images Error:', error);
            return [];
        }
    }

    private mapMangaToMetadata(manga: MangaDexManga): NovelMetadata {
        // Get first available title, prefer 'en'
        const title = manga.attributes.title['en'] || Object.values(manga.attributes.title)[0] || 'Unknown Title';
        const description = manga.attributes.description['en'] || Object.values(manga.attributes.description)[0] || '';

        // Find cover art
        const coverRel = manga.relationships.find(r => r.type === 'cover_art');
        const fileName = coverRel?.attributes?.fileName;
        const coverUrl = fileName
            ? `https://uploads.mangadex.org/covers/${manga.id}/${fileName}.256.jpg`
            : '';

        // Find author
        const authorRel = manga.relationships.find(r => r.type === 'author');
        const author = authorRel?.attributes?.name || 'Unknown Author';

        return {
            title,
            author,
            coverUrl,
            summary: description,
            status: manga.attributes.status,
            category: 'Manhwa',
            chapters: [],
            publishers: [],
            sourceUrl: `https://mangadex.org/title/${manga.id}`,
            sourceId: manga.id
        };
    }

    private async fetchJson(url: string): Promise<any> {
        const isNative = Capacitor.isNativePlatform();
        let finalUrl = url;

        if (!isNative) {
            // Web: MangaDex API supports CORS, so we can fetch directly.
            // Using the proxy sometimes triggers 403 errors depending on the referer/origin headers.
            finalUrl = url;
        }

        const headers: any = {
            'Accept': 'application/json'
        };

        // User-Agent is a forbidden header in browsers (web)
        if (isNative) {
            headers['User-Agent'] = 'NovelReadingApp/1.0';
        }

        try {
            const response = await fetch(finalUrl, {
                headers: headers
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        } catch (error) {
            console.warn('MangaDex Fetch failed', error);
            throw error;
        }
    }
}

export const mangaDexService = new MangaDexService();
