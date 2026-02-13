import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { dbService, type Novel, type Chapter } from '../services/db.service';
import { scraperService } from '../services/scraper.service';

interface UseChapterActionsProps {
    novel: Novel | null;
    novelId: string | undefined;
    chapters: Chapter[];
    liveChapters: { title: string; url: string; _index: number }[];
    locationState: any;
    setChapters: React.Dispatch<React.SetStateAction<Chapter[]>>;
    setDownloadedLiveChapters: React.Dispatch<React.SetStateAction<Set<string>>>;
    setAddedToLibrary: React.Dispatch<React.SetStateAction<boolean>>;
    onShowToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
    onShowModal: (title: string, msg: string, onConfirm: () => void, type?: 'danger' | 'primary') => void;
}

export function useChapterActions({
    novel,
    // novelId,
    chapters,
    // liveChapters,
    locationState,
    setChapters,
    setDownloadedLiveChapters,
    setAddedToLibrary,
    onShowToast,
    onShowModal
}: UseChapterActionsProps) {
    const navigate = useNavigate();

    const [downloading, setDownloading] = useState<Set<string>>(new Set());
    const [downloadingLive, setDownloadingLive] = useState<Set<string>>(new Set());
    const [isSyncing, setIsSyncing] = useState(false);
    const [isScrapingNew, setIsScrapingNew] = useState(false);

    // Helpers
    const getLiveNovelId = () => {
        const sourceUrl = novel?.sourceUrl || locationState?.novel?.sourceUrl || '';
        const path = sourceUrl.replace(/https?:\/\/[^\/]+/, '').replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        return `live-${path}`.slice(0, 80);
    };

    const ensureLiveNovelInDB = async () => {
        if (!novel) return '';
        const novelDbId = getLiveNovelId();
        await dbService.initialize();
        await dbService.addNovel({
            id: novelDbId,
            title: novel.title,
            author: novel.author || 'Unknown',
            coverUrl: novel.coverUrl || '',
            sourceUrl: novel.sourceUrl || '',
            summary: novel.summary || '',
            status: novel.status || 'Ongoing',
            source: 'NovelFire',
            category: novel.category || 'Novel',
        } as any);
        console.log(`[useChapterActions] ensureLiveNovelInDB: Saved ${novelDbId} as ${novel.category || 'Novel'}`);
        return novelDbId;
    };

    // Actions
    const handleInitialScrape = async () => {
        if (!novel?.sourceUrl) return;
        setIsScrapingNew(true);
        try {
            const scraped = await scraperService.fetchNovel(novel.sourceUrl);
            scraperService.startImport(novel.sourceUrl, scraped);
        } catch (e) {
            console.error("Scraping failed", e);
            onShowToast("Failed to fetch novel details.", 'error');
        } finally {
            setIsScrapingNew(false);
        }
    };

    const handleDownload = async (chapter: Chapter) => {
        if (downloading.has(chapter.id) || chapter.content) return;

        setDownloading(prev => new Set(prev).add(chapter.id));
        try {
            const content = await scraperService.fetchChapterContent(chapter.audioPath || '');
            await dbService.addChapter({ ...chapter, content });

            setChapters(prev => prev.map(c => c.id === chapter.id ? { ...c, content } : c));
            onShowToast(`Downloaded ${chapter.title}`, 'success');
        } catch (error) {
            console.error("Failed to download chapter", error);
            onShowToast(`Failed to download ${chapter.title}`, 'error');
        } finally {
            setDownloading(prev => {
                const next = new Set(prev);
                next.delete(chapter.id);
                return next;
            });
        }
    };

    const handleLiveDownloadChapter = async (chapter: { title: string; url: string }, index: number) => {
        if (downloadingLive.has(chapter.url)) return;

        setDownloadingLive(prev => new Set(prev).add(chapter.url));
        try {
            const novelDbId = await ensureLiveNovelInDB();
            const content = await scraperService.fetchChapterContent(chapter.url);

            if (content && content.length > 50) {
                await dbService.addChapter({
                    id: `${novelDbId}-ch-${index}`,
                    novelId: novelDbId,
                    title: chapter.title,
                    content,
                    orderIndex: index,
                    audioPath: chapter.url,
                });
                setDownloadedLiveChapters(prev => new Set(prev).add(chapter.url));
                onShowToast(`Downloaded ${chapter.title}`, 'success');
            } else {
                onShowToast(`Failed to download ${chapter.title}: Empty content`, 'error');
            }
        } catch (error) {
            console.error('Failed to download live chapter:', error);
            onShowToast(`Failed to download ${chapter.title}`, 'error');
        } finally {
            setDownloadingLive(prev => {
                const next = new Set(prev);
                next.delete(chapter.url);
                return next;
            });
        }
    };

    const handleDownloadAll = () => {
        if (!novel) return;
        const chaptersToDownload = chapters.filter(c => !c.content);

        if (chaptersToDownload.length === 0) {
            onShowToast("All chapters are already downloaded!", 'info');
            return;
        }

        onShowModal(
            "Download All",
            `Download ${chaptersToDownload.length} chapters in background?`,
            () => {
                scraperService.downloadAll(novel.id, novel.title, chaptersToDownload.map(c => ({
                    title: c.title,
                    url: c.audioPath || '',
                    audioPath: c.audioPath
                })));
                onShowToast("Background download started", 'info');
            },
            'primary'
        );
    };

    const triggerLiveDownloadAll = (undownloaded: any[]) => {
        if (!novel) return;

        if (undownloaded.length === 0) {
            onShowToast('All chapters are already downloaded!', 'info');
            return;
        }

        onShowModal(
            "Import Chapters",
            `Import ${undownloaded.length} chapters to your library for offline reading?`,
            async () => {
                try {
                    const novelDbId = await ensureLiveNovelInDB();
                    scraperService.downloadAll(novelDbId, novel.title, undownloaded.map((ch) => ({
                        title: ch.title,
                        url: ch.url,
                        audioPath: ch.url,
                    })));
                    onShowToast("Background download started", 'info');
                } catch (error) {
                    console.error('Failed to start download all:', error);
                    onShowToast('Failed to start download.', 'error');
                }
            },
            'primary'
        );
    }

    const handleSync = () => {
        if (!novel || !novel.sourceUrl) {
            onShowToast("Cannot sync: Source URL missing", 'error');
            return;
        }

        setIsSyncing(true);
        // Note: setShowMenu(false) should be handled by UI

        try {
            scraperService.syncNovel(novel.id, novel.sourceUrl, chapters.length);
            onShowToast("Sync started in background", 'info');
        } catch (error) {
            console.error("Sync failed", error);
            onShowToast("Failed to start sync.", 'error');
        } finally {
            setIsSyncing(false);
        }
    };

    const handleDelete = () => {
        if (!novel) return;

        onShowModal(
            "Delete Novel",
            `Are you sure you want to delete "${novel.title}"? All chapters and progress will be removed.`,
            async () => {
                try {
                    await dbService.deleteNovel(novel.id);
                    navigate('/', { replace: true });
                } catch (error) {
                    console.error("Deletion failed", error);
                    onShowToast("Failed to delete novel.", 'error');
                }
            },
            'danger'
        );
    };

    const handleAddToLibrary = async () => {
        try {
            await ensureLiveNovelInDB();
            setAddedToLibrary(true);
            onShowToast("Added to library", 'success');
        } catch (error) {
            console.error('Failed to add to library:', error);
            onShowToast('Failed to add to library.', 'error');
        }
    };

    return {
        downloading,
        downloadingLive,
        isSyncing,
        isScrapingNew,
        handleInitialScrape,
        handleDownload,
        handleLiveDownloadChapter,
        handleDownloadAll,
        triggerLiveDownloadAll,
        handleSync,
        handleDelete,
        handleAddToLibrary
    };
}
