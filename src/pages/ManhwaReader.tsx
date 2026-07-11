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
import { StatusBar } from '@capacitor/status-bar';
import { Capacitor } from '@capacitor/core';

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

    // De-dupe guard: prevent double lazy-load fetches (React Strict Mode / fast nav)
    const fetchingChapterRef = useRef<string | null>(null);

    // Fetch Data — uses location.pathname in deps to guarantee re-fire on every route change
    useEffect(() => {
        // Capture the current params from the URL at the time the effect fires
        const currentNovelId = novelId;
        const currentChapterId = chapterId;

        const loadData = async () => {
            if (!currentNovelId && !location.state?.chapterUrl) return;

            setIsLoading(true);

            try {
                // Determine if we are in live mode
                if (!currentNovelId && location.state?.chapterUrl) {
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
                    console.log(`[ManhwaReader] Loading chapter: novelId=${currentNovelId}, chapterId=${currentChapterId}`);
                    const [novel, ch, chapters] = await Promise.all([
                        dbService.getNovel(currentNovelId!),
                        dbService.getChapter(currentNovelId!, currentChapterId!),
                        dbService.getChapters(currentNovelId!)
                    ]);

                    if (novel) setNovelTitle(novel.title);
                    if (ch) {
                        console.log(`[ManhwaReader] Loaded chapter: "${ch.title}" (id: ${ch.id}), audioPath: ${ch.audioPath}`);
                        // Lazy load: If chapter is empty but has a source URL/HID, fetch images now
                        if (!ch.content || ch.content.length < 50) {
                            if (ch.audioPath && fetchingChapterRef.current !== ch.id) {
                                fetchingChapterRef.current = ch.id;
                                setIsLoading(true);
                                try {
                                    const images = await manhwaScraperService.fetchChapterImages(ch.audioPath);
                                    if (images && images.length > 50) {
                                        ch.content = images;
                                        await dbService.updateChapterContent(currentNovelId!, ch.id, images);
                                    }
                                } catch (err) {
                                    console.error("Lazy load failed", err);
                                } finally {
                                    fetchingChapterRef.current = null;
                                }
                            }
                        }
                        setChapter(ch);
                        dbService.updateReadingProgress(currentNovelId!, currentChapterId!);
                    } else {
                        console.warn(`[ManhwaReader] Chapter not found in DB: ${currentChapterId}`);
                        setChapter(null);
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
    }, [novelId, chapterId, location.pathname]);

    // Handle Scroll for Controls Visibility (rAF-throttled)
    useEffect(() => {
        let rafId: number | null = null;

        const handleScroll = () => {
            if (rafId !== null) return; // Already a pending frame — skip
            rafId = requestAnimationFrame(() => {
                const currentScrollY = window.scrollY;

                // Show controls if scrolling UP or at the very top/bottom
                if (currentScrollY < lastScrollY.current || currentScrollY < 100) {
                    setShowControls(true);
                } else if (currentScrollY > lastScrollY.current && currentScrollY > 100) {
                    setShowControls(false);
                }

                lastScrollY.current = currentScrollY;
                rafId = null;
            });
        };

        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => {
            window.removeEventListener('scroll', handleScroll);
            if (rafId !== null) cancelAnimationFrame(rafId);
        };
    }, []);

    // Sync System Bar with Header Visibility
    useEffect(() => {
        const syncStatusBar = async () => {
            if (Capacitor.isNativePlatform()) {
                try {
                    if (showControls) {
                        await StatusBar.show();
                    } else {
                        await StatusBar.hide();
                    }
                } catch (e) {
                    // Ignore errors on non-compatible environments
                }
            }
        };

        syncStatusBar();

        // Cleanup: Ensure bar is shown when leaving
        return () => {
            if (Capacitor.isNativePlatform()) {
                StatusBar.show().catch(() => { });
            }
        };
    }, [showControls]);

    const handleNextChapter = async () => {
        if (!chapter || !novelId) return;
        const currentIndex = allChapters.findIndex(c => c.id === chapter.id);
        if (currentIndex !== -1 && currentIndex < allChapters.length - 1) {
            const nextChapter = allChapters[currentIndex + 1];
            navigate(`/manhwa/read/${encodeURIComponent(novelId!)}/${encodeURIComponent(nextChapter.id)}`, { replace: true });
        }
    };

    const handlePrevChapter = () => {
        if (!chapter || !novelId) return;
        const currentIndex = allChapters.findIndex(c => c.id === chapter.id);
        if (currentIndex > 0) {
            const prevChapter = allChapters[currentIndex - 1];
            navigate(`/manhwa/read/${encodeURIComponent(novelId!)}/${encodeURIComponent(prevChapter.id)}`, { replace: true });
        }
    };

    const handleChapterSelect = (selectedChapter: Chapter) => {
        // Close sidebar first to prevent state race conditions
        setShowSidebar(false);
        // Navigate to the selected chapter
        console.log(`[ManhwaReader] Sidebar selected: "${selectedChapter.title}" (id: ${selectedChapter.id})`);
        navigate(`/manhwa/read/${encodeURIComponent(novelId!)}/${encodeURIComponent(selectedChapter.id)}`, { replace: true });
    };

    const handleToggleControls = () => {
        setShowControls(prev => !prev);
    };

    // Edge Swipe to Open Sidebar
    const edgeSwipeStartRef = useRef<{ x: number; y: number } | null>(null);
    const SWIPE_ZONE_WIDTH = 0.5;
    const OPEN_THRESHOLD = 60;
    const MAX_VERTICAL_DRIFT = 40;

    const handleEdgeTouchStart = (e: React.TouchEvent) => {
        const touch = e.touches[0];
        const screenWidth = window.innerWidth;
        if (touch.clientX <= screenWidth * SWIPE_ZONE_WIDTH) {
            edgeSwipeStartRef.current = { x: touch.clientX, y: touch.clientY };
        }
    };

    const handleEdgeTouchMove = (e: React.TouchEvent) => {
        if (edgeSwipeStartRef.current === null) return;
        const touch = e.touches[0];
        const diffX = touch.clientX - edgeSwipeStartRef.current.x;
        const diffY = Math.abs(touch.clientY - edgeSwipeStartRef.current.y);

        if (diffY > MAX_VERTICAL_DRIFT) {
            edgeSwipeStartRef.current = null;
            return;
        }

        if (diffX > OPEN_THRESHOLD && diffX > diffY * 1.5) {
            setShowSidebar(true);
            edgeSwipeStartRef.current = null;
        }
    };

    const handleEdgeTouchEnd = () => {
        edgeSwipeStartRef.current = null;
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

    const currentChapterIndex = allChapters.findIndex(c => c.id === chapter.id);
    const hasNextChapter = currentChapterIndex !== -1 && currentChapterIndex < allChapters.length - 1;
    const hasPrevChapter = currentChapterIndex > 0;

    return (
        <div
            ref={containerRef}
            className="min-h-screen bg-black pb-20 relative selection:bg-primary/30"
            onClick={handleToggleControls} // Toggle controls on tap anywhere
            onTouchStart={handleEdgeTouchStart}
            onTouchMove={handleEdgeTouchMove}
            onTouchEnd={handleEdgeTouchEnd}
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
                    onPrev={handlePrevChapter}
                    onHistory={() => setShowSidebar(true)}
                    hasNextChapter={hasNextChapter}
                    hasPrevChapter={hasPrevChapter}
                />
            </div>

            {/* Sidebar — uses chapterId from URL (not stale chapter.id) for accurate highlighting */}
            <ChapterSidebar
                isOpen={showSidebar}
                onClose={() => setShowSidebar(false)}
                chapters={allChapters}
                currentChapterId={chapterId || ''}
                novelTitle={novelTitle}
                onSelectChapter={handleChapterSelect}
            />
        </div>
    );
};
