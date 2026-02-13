import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { dbService } from '../services/db.service';
import type { Chapter } from '../services/db.service';
import { WebtoonViewer } from '../components/manhwa/WebtoonViewer';
import { ReaderControls } from '../components/manhwa/ReaderControls';
import { manhwaScraperService } from '../services/manhwaScraper.service';
import { ChapterSidebar } from '../components/ChapterSidebar'; // Reusing existing
import { ReadingProgressBar } from '../components/manhwa/ReadingProgressBar';
import { Header } from '../components/Header';
import { AnimatePresence, motion } from 'framer-motion';

export const ManhwaReader = () => {
    const { novelId, chapterId } = useParams<{ novelId: string; chapterId: string }>();
    const navigate = useNavigate();
    const location = useLocation();

    const [chapter, setChapter] = useState<Chapter | null>(null);
    const [novelTitle, setNovelTitle] = useState('');
    const [allChapters, setAllChapters] = useState<Chapter[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showControls, setShowControls] = useState(true);
    const [showSidebar, setShowSidebar] = useState(false);

    // For removing controls on scroll
    const lastScrollY = useRef(0);
    const containerRef = useRef<HTMLDivElement>(null);

    // Fetch Data
    useEffect(() => {

        const loadData = async () => {
            if (!novelId && !location.state?.chapterUrl) return;

            // Don't set loading true here if we are just switching chapters to avoid full screen flash if we can avoid it,
            // but for now, safety first.
            setIsLoading(true);

            try {
                // Determine if we are in live mode
                if (!novelId && location.state?.chapterUrl) {
                    // LIVE MODE
                    const state = location.state;
                    setNovelTitle(state.novelTitle || 'Unknown');

                    // Construct basic chapter from state
                    setChapter({
                        id: state.chapterUrl,
                        novelId: 'live',
                        title: state.chapterTitle,
                        content: '', // Will be loaded by WebtoonViewer or refined scraper
                        orderIndex: state.currentIndex,
                        audioPath: state.chapterUrl
                    } as Chapter);

                    // Use passed chapters for sidebar, but sync read status
                    if (state.chapters) {
                        // Generate stable ID for lookup
                        const sourceUrl = state.novelSourceUrl || '';
                        const path = sourceUrl.replace(/https?:\/\/[^\/]+/, '').replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
                        const stableNovelId = `live-${path}`.slice(0, 80);

                        // Try to get read status
                        try {
                            const dbChapters = await dbService.getChapters(stableNovelId);
                            const readStatusMap = new Set(dbChapters.filter(c => c.isRead).map(c => c.id));

                            setAllChapters(state.chapters.map((ch: any, idx: number) => ({
                                id: ch.url,
                                novelId: stableNovelId,
                                title: ch.title,
                                orderIndex: idx,
                                isRead: (readStatusMap.has(ch.url) || readStatusMap.has(`${stableNovelId}-ch-${idx}`)) ? 1 : 0
                            } as Chapter)));
                        } catch (e) {
                            console.warn("Failed to sync read status", e);
                            setAllChapters(state.chapters.map((ch: any, idx: number) => ({
                                id: ch.url,
                                novelId: 'live',
                                title: ch.title,
                                orderIndex: idx,
                            } as Chapter)));
                        }
                    }

                    // Fetch content for live chapter
                    // ... (omitted for brevity, handled by WebtoonViewer or separate call)
                } else {
                    // LOCAL MODE
                    const [novel, ch, chapters] = await Promise.all([
                        dbService.getNovel(novelId!),
                        dbService.getChapter(novelId!, chapterId!),
                        dbService.getChapters(novelId!)
                    ]);

                    if (novel) setNovelTitle(novel.title);
                    if (ch) {
                        // ... (Lazy load logic same as before) ...
                        if (!ch.content || ch.content.length < 50) {
                            if (ch.audioPath && ch.audioPath.startsWith('http')) {
                                setIsLoading(true);
                                try {
                                    const images = await manhwaScraperService.fetchChapterImages(ch.audioPath);
                                    if (images && images.length > 50) {
                                        ch.content = images;
                                        await dbService.updateChapterContent(novelId!, ch.id, images);
                                    }
                                } catch (err) {
                                    console.error("Lazy load failed", err);
                                }
                            }
                        }
                        setChapter(ch);
                        dbService.updateReadingProgress(novelId!, chapterId!);
                    }
                    setAllChapters(chapters);
                }
            } catch (error) {
                console.error("Failed to load reader data", error);
            } finally {
                setIsLoading(false);
                setShowControls(true);
                window.scrollTo(0, 0);
            }
        };

        loadData();
    }, [novelId, chapterId]);

    // Handle Scroll for Controls Visibility
    useEffect(() => {
        const handleScroll = () => {
            const currentScrollY = window.scrollY;

            // Show controls if scrolling UP or at the very top/bottom
            if (currentScrollY < lastScrollY.current || currentScrollY < 100) {
                setShowControls(true);
            } else if (currentScrollY > lastScrollY.current && currentScrollY > 100) {
                setShowControls(false);
            }

            lastScrollY.current = currentScrollY;
        };

        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const handleNextChapter = async () => {
        if (!chapter || !novelId) return;

        // Find next chapter index
        const currentIndex = allChapters.findIndex(c => c.id === chapter.id);
        if (currentIndex !== -1 && currentIndex < allChapters.length - 1) {
            const nextChapter = allChapters[currentIndex + 1];
            navigate(`/manhwa/read/${novelId}/${nextChapter.id}`, { replace: true });
        }
    };

    const handleChapterSelect = (ch: Chapter) => {
        navigate(`/manhwa/read/${novelId}/${ch.id}`, { replace: true });
    };

    const handleToggleControls = () => {
        setShowControls(prev => !prev);
    };

    if (isLoading && !chapter) {
        return <div className="min-h-screen bg-black" />; // Minimal loader
    }

    if (!chapter) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white">
                <p>Chapter not found.</p>
                <button onClick={() => navigate(-1)} className="mt-4 text-primary font-bold">Go Back</button>
            </div>
        );
    }

    const hasNextChapter = (() => {
        const currentIndex = allChapters.findIndex(c => c.id === chapter.id);
        return currentIndex !== -1 && currentIndex < allChapters.length - 1;
    })();

    return (
        <div
            ref={containerRef}
            className="min-h-screen bg-black pb-20 relative selection:bg-primary/30"
            onClick={handleToggleControls} // Toggle controls on tap anywhere
        >
            {/* Header */}
            <AnimatePresence>
                {showControls && (
                    <motion.div
                        initial={{ y: -100, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: -100, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="fixed top-0 left-0 right-0 z-50 pointer-events-none"
                    >
                        {/* Wrapper to allow pointer events only on buttons if needed, but Header handles it */}
                        <div className="pointer-events-auto">
                            <Header
                                title={novelTitle}
                                subtitle={chapter.title}
                                showBack
                                transparent
                                className="text-white bg-black/60 backdrop-blur-md border-b border-white/5"
                            />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Content */}
            <main className="w-full max-w-3xl mx-auto">
                <WebtoonViewer
                    content={chapter.content}
                    isLoading={isLoading}
                />
            </main>

            {/* Reading Progress */}
            <ReadingProgressBar containerRef={containerRef} />

            {/* Bottom Controls */}
            <div onClick={(e) => e.stopPropagation()}>
                <ReaderControls
                    show={showControls}
                    onNext={handleNextChapter}
                    onHistory={() => setShowSidebar(true)}
                    hasNextChapter={hasNextChapter}
                    // Theme toggle can be omitted for Webtoon mode usually (images dictate theme), 
                    // but we can keep it if we want to affect surrounding UI.
                    isDarkMode={true}
                    onToggleTheme={() => { }}
                />
            </div>

            {/* Sidebar */}
            <ChapterSidebar
                isOpen={showSidebar}
                onClose={() => setShowSidebar(false)}
                chapters={allChapters}
                currentChapterId={chapter.id}
                novelTitle={novelTitle}
                onSelectChapter={handleChapterSelect}
            />
        </div>
    );
};
