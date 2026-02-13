import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { dbService } from '../services/db.service';
import type { Novel, Chapter } from '../services/db.service';
import { manhwaScraperService } from '../services/manhwaScraper.service';
import { Header } from '../components/Header';
import { SeriesHero } from '../components/manhwa/SeriesHero';
import { ChapterList } from '../components/manhwa/ChapterList';
import { Loader2, Book } from 'lucide-react';
import { motion } from 'framer-motion';

export const ManhwaSeries = () => {
    const { novelId } = useParams<{ novelId: string }>();
    const navigate = useNavigate();
    const [novel, setNovel] = useState<Novel | null>(null);
    const [chapters, setChapters] = useState<Chapter[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const loadData = async () => {
            if (!novelId) return;
            setIsLoading(true);
            try {
                const novelData = await dbService.getNovel(novelId);
                const chapterData = await dbService.getChapters(novelId);
                setNovel(novelData);
                setChapters(chapterData);
            } catch (error) {
                console.error("Failed to load series data", error);
            } finally {
                setIsLoading(false);
            }
        };

        loadData();
    }, [novelId]);

    // Background refresh for metadata if title is noisy
    useEffect(() => {
        const refreshMetadata = async () => {
            if (!novelId || !novel || !novel.sourceUrl || isLoading) return;

            const isNoisy = (t: string) => {
                const u = t.toUpperCase();
                return u === 'UNKNOWN TITLE' || u.includes('BETA SITE') || u.includes('READ ON OUR');
            };

            if (isNoisy(novel.title)) {
                try {
                    console.log(`[ManhwaSeries] Refreshing noisy title: ${novel.title}`);
                    const freshData = await manhwaScraperService.fetchNovel(novel.sourceUrl);
                    if (freshData && !isNoisy(freshData.title)) {
                        await dbService.updateNovelMetadata(novelId, {
                            title: freshData.title,
                            author: freshData.author,
                            coverUrl: freshData.coverUrl,
                            status: freshData.status,
                            summary: freshData.summary
                        });
                        setNovel(prev => prev ? { ...prev, ...freshData } : null);
                    }
                } catch (e) {
                    console.error("Failed to background refresh metadata", e);
                }
            }
        };

        refreshMetadata();
    }, [isLoading, novel?.id, novel?.title, novelId]);

    const handleChapterSelect = (chapter: Chapter) => {
        if (!novelId) return;
        navigate(`/manhwa/read/${novelId}/${chapter.id}`); // Using the new reader route
    };

    const handleReadNow = () => {
        if (!novel || chapters.length === 0) return;

        let targetChapter = chapters[0]; // Default to first
        if (novel.lastReadChapterId) {
            const lastRead = chapters.find(c => c.id === novel.lastReadChapterId);
            if (lastRead) targetChapter = lastRead;
        }

        handleChapterSelect(targetChapter);
    };

    const handleDownload = async (chapter: Chapter) => {
        // Integrate with scraperService to download/cache content if not present
        if (!novel) return;
        // This is a stub for the "Download" trigger. 
        // In a real implementation, we'd check if content exists and if not, trigger a background scrape.
        console.log("Download triggered for", chapter.title);
        // We can trigger the existing scraper logic here if needed:
        // await scraperService.startImport(...) but for a single chapter.
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-background-light dark:bg-background-dark">
                <Loader2 className="w-10 h-10 animate-spin text-primary" />
            </div>
        );
    }

    if (!novel) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-background-light dark:bg-background-dark text-slate-500">
                <p>Series not found.</p>
                <button onClick={() => navigate(-1)} className="mt-4 text-primary">Go Back</button>
            </div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="min-h-screen bg-background-light dark:bg-background-dark pb-10"
        >
            {/* Transparent Header with Gradient and Title */}
            <Header
                title={novel?.title || ''}
                subtitle={novel?.category || 'Manhwa'}
                transparent
                showBack
                className="fixed top-0 left-0 right-0 z-50 text-white bg-gradient-to-b from-black/80 via-black/40 to-transparent"
            />

            <SeriesHero
                novel={novel}
                onReadNow={handleReadNow}
                chapterCount={chapters.length}
                inLibrary={true} // Hardcoded for now, assuming if in DB it's in library
            />

            <div className="mt-8">
                <ChapterList
                    chapters={chapters}
                    onChapterSelect={handleChapterSelect}
                    onDownload={handleDownload}
                    currentChapterId={novel.lastReadChapterId}
                />
            </div>

            {/* Resume Button Float (if scrolled down - optional, strictly implementing footer nav is safer) */}
            {/* Design reference has a "CONTINUE READING" sticky button at bottom */}
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[calc(100%-48px)] max-w-md z-40">
                <button
                    onClick={handleReadNow}
                    className="w-full h-14 bg-white text-background-dark rounded-full font-black text-lg shadow-2xl flex items-center justify-center gap-3 active:scale-[0.98] transition-all"
                >
                    <Book className="fill-current" size={20} />
                    CONTINUE READING
                </button>
            </div>
        </motion.div>
    );
};
