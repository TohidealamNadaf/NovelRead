import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { dbService } from '../services/db.service';
import type { Novel, Chapter } from '../services/db.service';
import { manhwaScraperService } from '../services/manhwaScraper.service';
import { Header } from '../components/Header';
import { SeriesHero } from '../components/manhwa/SeriesHero';
import { ChapterList } from '../components/manhwa/ChapterList';
import { Loader2, Book } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export const ManhwaSeries = () => {
    const { novelId } = useParams<{ novelId: string }>();
    const navigate = useNavigate();
    const [novel, setNovel] = useState<Novel | null>(null);
    const [chapters, setChapters] = useState<Chapter[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showFixedButton, setShowFixedButton] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            // Show button when scrolled past the hero actions (around 450px)
            if (window.scrollY > 450) {
                setShowFixedButton(true);
            } else {
                setShowFixedButton(false);
            }
        };

        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

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
        if (!novel || !novelId) return;

        try {
            console.log(`[ManhwaSeries] Downloading chapter: ${chapter.title}`);
            // audioPath stores the source URL for manhwa chapters
            const content = await manhwaScraperService.fetchChapterImages(chapter.audioPath || '');

            if (content && content.length > 50) { // Basic sanity check
                await dbService.updateChapterContent(novelId, chapter.id, content);

                // Update local state to reflect download status immediately
                setChapters(prev => prev.map(c =>
                    c.id === chapter.id ? { ...c, content } : c
                ));
                console.log(`[ManhwaSeries] ✓ Downloaded ${chapter.title}`);
            }
        } catch (error) {
            console.error(`[ManhwaSeries] Failed to download chapter ${chapter.title}`, error);
        }
    };

    const handleMassDownload = async () => {
        if (!novel || chapters.length === 0) return;

        const undownloaded = chapters.filter(c => !c.content);
        if (undownloaded.length === 0) {
            console.log("[ManhwaSeries] All chapters already downloaded.");
            return;
        }

        console.log(`[ManhwaSeries] Starting mass download of ${undownloaded.length} chapters...`);

        // Process in small batches to avoid overwhelming the system/network
        const batchSize = 3;
        for (let i = 0; i < undownloaded.length; i += batchSize) {
            const batch = undownloaded.slice(i, i + batchSize);
            await Promise.all(batch.map(ch => handleDownload(ch)));
        }

        console.log("[ManhwaSeries] Mass download complete.");
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

    const hasStartedReading = !!novel.lastReadChapterId;

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
                hasStartedReading={hasStartedReading}
            />

            <div className="mt-8">
                <ChapterList
                    chapters={chapters}
                    onChapterSelect={handleChapterSelect}
                    onDownload={handleDownload}
                    onMassDownload={handleMassDownload}
                    currentChapterId={novel.lastReadChapterId}
                />
            </div>

            {/* Resume Button Float (if scrolled down) */}
            <AnimatePresence>
                {showFixedButton && (
                    <motion.div
                        initial={{ y: 100, x: '-50%', opacity: 0 }}
                        animate={{ y: 0, x: '-50%', opacity: 1 }}
                        exit={{ y: 100, x: '-50%', opacity: 0 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        className="fixed bottom-6 left-1/2 w-[calc(100%-48px)] max-w-md z-40"
                    >
                        <button
                            onClick={handleReadNow}
                            className="w-full h-14 bg-primary text-white rounded-full font-black text-lg shadow-[0_8px_30px_rgb(93,88,240,0.4)] flex items-center justify-center gap-3 active:scale-[0.98] transition-all border border-white/20 bg-gradient-to-r from-primary to-[#706cf4]"
                        >
                            <Book className="fill-current" size={20} />
                            {hasStartedReading ? 'CONTINUE READING' : 'START READING'}
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};
