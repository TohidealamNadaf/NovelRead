import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { dbService } from '../services/db.service';
import type { Novel, Chapter } from '../services/db.service';
import { manhwaScraperService } from '../services/manhwaScraper.service';
import { Header } from '../components/Header';
import { Toast } from '../components/Toast';

import { SeriesHero } from '../components/manhwa/SeriesHero';
import { ChapterList } from '../components/manhwa/ChapterList';
import { Loader2, Book } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { isPlaceholderContent } from '../utils/contentUtils';

export const ManhwaSeries = () => {
    const { novelId } = useParams<{ novelId: string }>();
    const navigate = useNavigate();
    const [novel, setNovel] = useState<Novel | null>(null);
    const [chapters, setChapters] = useState<Chapter[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showFixedButton, setShowFixedButton] = useState(false);
    const [downloadingChapterIds, setDownloadingChapterIds] = useState<Set<string>>(new Set());
    const [failedChapterIds, setFailedChapterIds] = useState<Set<string>>(new Set());
    const [inLibrary, setInLibrary] = useState(true);
    const [remoteMetadata, setRemoteMetadata] = useState<any>(null); // Keep original metadata for import
    
    const novelRef = useRef(novel);
    useEffect(() => { novelRef.current = novel; }, [novel]);

    // Toast State
    const [toast, setToast] = useState<{ message: string; type: 'info' | 'success' | 'error' | 'warning' } | null>(null);
    const showToast = useCallback((message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') => {
        setToast({ message, type });
    }, []);

    // Dynamic Header State
    const [showHeader, setShowHeader] = useState(true);
    const [isScrolled, setIsScrolled] = useState(false);
    const lastScrollY = useRef(0);

    useEffect(() => {
        const handleScroll = () => {
            const currentScrollY = window.scrollY;
            
            // 1. Show/Hide Fixed Read Button (Resume)
            if (currentScrollY > 450) {
                setShowFixedButton(true);
            } else {
                setShowFixedButton(false);
            }

            // 2. Dynamic Header Logic (Hide on scroll down, Show on scroll up)
            if (currentScrollY < 10) {
                // Always show at the very top
                setShowHeader(true);
            } else if (currentScrollY > lastScrollY.current && currentScrollY > 100) {
                // Scrolling Down + passed threshold
                setShowHeader(false);
            } else if (currentScrollY < lastScrollY.current) {
                // Scrolling Up
                setShowHeader(true);
            }

            setIsScrolled(currentScrollY > 40);
            lastScrollY.current = currentScrollY;
        };

        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    useEffect(() => {
        let isMounted = true;
        const loadData = async () => {
            if (!novelId) return;
            setIsLoading(true);
            setNovel(null);
            setChapters([]);
            setRemoteMetadata(null);
            setInLibrary(false);
            
            try {
                let decodedId = decodeURIComponent(novelId);
                const isRemoteUrl = decodedId.startsWith('http');

                if (isRemoteUrl) {
                    // Check if it's already in the DB by sourceUrl
                    const allNovels = await dbService.getNovels();
                    const existing = allNovels.find(n => n.sourceUrl === decodedId);
                    
                    if (existing) {
                        const novelData = await dbService.getNovel(existing.id);
                        const chapterData = await dbService.getChapters(existing.id);
                        if (!isMounted) return;
                        setNovel(novelData);
                        setChapters(chapterData);
                        setInLibrary(true);
                    } else {
                        // Fetch remotely for preview
                        const metadata = await manhwaScraperService.fetchNovel(decodedId);
                        if (!isMounted) return;
                        if (metadata) {
                            const adaptedNovel: Novel = {
                                id: decodedId, // Temporary ID
                                title: metadata.title,
                                author: metadata.author,
                                coverUrl: metadata.coverUrl,
                                status: metadata.status,
                                summary: metadata.summary,
                                category: metadata.category || 'Manhwa',
                                sourceUrl: decodedId,
                                createdAt: Date.now()
                            };

                            const adaptedChapters: Chapter[] = metadata.chapters.map((ch, idx) => ({
                                id: `${decodedId}-ch-${idx}`,
                                novelId: decodedId,
                                title: ch.title,
                                content: '',
                                orderIndex: idx,
                                audioPath: ch.url, // URL stored here
                                date: ch.date || '',
                                isRead: 0
                            }));

                            setNovel(adaptedNovel);
                            setChapters(adaptedChapters);
                            setInLibrary(false);
                            setRemoteMetadata(metadata);
                        }
                    }
                } else {
                    const novelData = await dbService.getNovel(novelId);
                    const chapterData = await dbService.getChapters(novelId);
                    if (!isMounted) return;
                    setNovel(novelData);
                    setChapters(chapterData);
                    setInLibrary(true);
                }
            } catch (error) {
                console.error("Failed to load series data", error);
            } finally {
                if (isMounted) setIsLoading(false);
            }
        };

        loadData();
        return () => { isMounted = false; };
    }, [novelId]);

    // Background refresh for metadata and chapters
    const isRefreshingRef = useRef(false);

    useEffect(() => {
        let isMounted = true;
        const refreshMetadata = async () => {
            const currentNovel = novelRef.current;
            if (!novelId || !currentNovel || !currentNovel.sourceUrl || isLoading || !inLibrary) return;
            if (!navigator.onLine) return;
            if (isRefreshingRef.current) return;
            isRefreshingRef.current = true;

            try {
                console.log(`[ManhwaSeries] Checking for updates: ${currentNovel.title}`);
                const freshData = await manhwaScraperService.fetchNovel(currentNovel.sourceUrl);
                if (!freshData) return;

                // --- Always refresh metadata (title, cover, summary, etc.) ---
                const isNoisy = (t: string) => {
                    const u = t.toUpperCase();
                    return u === 'UNKNOWN TITLE' || u.includes('BETA SITE') || u.includes('READ ON OUR') ||
                        u === 'ASURA SCANS' || u === 'ASURACOMIC' || u.includes('ASURASCANS') ||
                        u.includes('MANGA') && u.length < 15;
                };

                const shouldUpdateMeta = isNoisy(currentNovel.title) ||
                    !currentNovel.coverUrl || currentNovel.coverUrl.includes('placeholder') ||
                    !currentNovel.summary || currentNovel.summary.trim().length === 0 ||
                    (freshData.title && freshData.title !== currentNovel.title && !isNoisy(freshData.title));

                if (shouldUpdateMeta && !isNoisy(freshData.title)) {
                    console.log(`[ManhwaSeries] Refreshing metadata: "${currentNovel.title}" -> "${freshData.title}"`);
                    await dbService.updateNovelMetadata(novelId, {
                        title: freshData.title,
                        author: freshData.author,
                        coverUrl: freshData.coverUrl,
                        status: freshData.status,
                        summary: freshData.summary
                    });
                    if (!isMounted) return;
                    setNovel(prev => prev ? {
                        ...prev,
                        title: freshData.title,
                        author: freshData.author,
                        coverUrl: freshData.coverUrl,
                        status: freshData.status,
                        summary: freshData.summary
                    } : null);
                }

                // --- Chapter sync ---
                if (freshData.chapters.length > 0) {
                    const freshCount = freshData.chapters.length;
                    const localCount = chapters.length;
                    const missingRatio = localCount > 0 ? freshCount / localCount : Infinity;

                    // If the remote has significantly more chapters (>30% more), do a full re-sync
                    if (missingRatio > 1.3 || (freshCount - localCount > 20)) {
                        console.log(`[ManhwaSeries] Full re-sync: ${localCount} local vs ${freshCount} remote chapters`);

                        // Preserve existing content/read-status by matching on source URL (audioPath)
                        const existingByUrl = new Map(chapters.map(c => [c.audioPath, c]));

                        // Delete all existing chapters and re-insert from fresh data
                        await dbService.deleteChaptersByNovelId(novelId);

                        const newChapterObjects: Chapter[] = [];
                        for (let i = 0; i < freshData.chapters.length; i++) {
                            const ch = freshData.chapters[i];
                            const existing = existingByUrl.get(ch.url);
                            const chapterObj: Chapter = {
                                id: `${novelId}-ch-${i + 1}`,
                                novelId,
                                title: ch.title,
                                content: existing?.content || '',
                                orderIndex: i,
                                audioPath: ch.url,
                                date: ch.date || existing?.date || '',
                                isRead: existing?.isRead || 0
                            };
                            newChapterObjects.push(chapterObj);
                        }
                        
                        // Bulk insert to prevent UI freezing
                        await dbService.addChapters(newChapterObjects);
                        if (!isMounted) return;
                        setChapters(newChapterObjects);
                        console.log(`[ManhwaSeries] Full re-sync complete: ${newChapterObjects.length} chapters (preserved ${newChapterObjects.filter(c => c.content).length} downloaded).`);

                    } else if (freshCount > localCount) {
                        // Just append new chapters
                        const existingUrls = new Set(chapters.map(c => c.audioPath));
                        const newChapters = freshData.chapters.filter(c => !existingUrls.has(c.url));

                        if (newChapters.length > 0) {
                            const startOrderIndex = chapters.length;
                            const newChapterObjects: Chapter[] = [];

                            for (let i = 0; i < newChapters.length; i++) {
                                const ch = newChapters[i];
                                const chapterObj: Chapter = {
                                    id: `${novelId}-ch-${startOrderIndex + i + 1}`,
                                    novelId,
                                    title: ch.title,
                                    content: '',
                                    orderIndex: startOrderIndex + i,
                                    audioPath: ch.url,
                                    date: new Date().toISOString().split('T')[0],
                                    isRead: 0
                                };
                                newChapterObjects.push(chapterObj);
                            }
                            
                            // Bulk insert new appended chapters
                            await dbService.addChapters(newChapterObjects);
                            if (!isMounted) return;
                            setChapters(prev => [...prev, ...newChapterObjects]);
                            console.log(`[ManhwaSeries] Appended ${newChapters.length} new chapters.`);
                        }
                    }
                }
            } catch (e) {
                console.error("[ManhwaSeries] Failed to refresh", e);
            } finally {
                isRefreshingRef.current = false;
            }
        };

        refreshMetadata();
        return () => { isMounted = false; };
    }, [isLoading, novelId, inLibrary]);

    const handleChapterSelect = (chapter: Chapter) => {
        if (!inLibrary || !novel?.id || novel.id.startsWith('http')) {
            showToast("Please save the series to your library first to read chapters.", "warning");
            return;
        }
        navigate(`/manhwa/read/${encodeURIComponent(novelId!)}/${encodeURIComponent(chapter.id)}`); // Using the new reader route
    };

    const handleToggleLibrary = async () => {
        if (inLibrary) {
            showToast("Already in library.", "info");
            return;
        }
        if (remoteMetadata && novel) {
            await manhwaScraperService.startImport(novel.sourceUrl!, remoteMetadata);
            showToast("Import complete!", "success");
            navigate('/'); // The library is actually at '/'
        }
    };

    const handleReadNow = () => {
        if (!novel || chapters.length === 0) return;
        if (!inLibrary) {
            showToast("Please save the series to your library first to read chapters.", "warning");
            return;
        }

        let targetChapter = chapters[0]; // Default to first
        if (novel.lastReadChapterId) {
            const lastRead = chapters.find(c => c.id === novel.lastReadChapterId);
            if (lastRead) targetChapter = lastRead;
        }

        handleChapterSelect(targetChapter);
    };

    const handleDownload = async (chapter: Chapter) => {
        if (!novel || !novelId) return;

        setDownloadingChapterIds(prev => new Set(prev).add(chapter.id));
        setFailedChapterIds(prev => {
            const next = new Set(prev);
            next.delete(chapter.id); // Clear previous failure if retrying
            return next;
        });

        try {
            console.log(`[ManhwaSeries] Downloading chapter: ${chapter.title}`);
            // audioPath stores the source URL for manhwa chapters
            const content = await manhwaScraperService.fetchChapterImages(chapter.audioPath || '');

            if (!isPlaceholderContent(content)) { // Basic sanity check
                await dbService.updateChapterContent(novelId, chapter.id, content);

                // Update local state to reflect download status immediately
                setChapters(prev => prev.map(c =>
                    c.id === chapter.id ? { ...c, content } : c
                ));
                console.log(`[ManhwaSeries] ✓ Downloaded ${chapter.title}`);
            } else {
                throw new Error("Empty or placeholder content received");
            }
        } catch (error) {
            console.error(`[ManhwaSeries] Failed to download chapter ${chapter.title}`, error);
            setFailedChapterIds(prev => new Set(prev).add(chapter.id));
        } finally {
            setDownloadingChapterIds(prev => {
                const next = new Set(prev);
                next.delete(chapter.id);
                return next;
            });
        }
    };

    const [massDownloadProgress, setMassDownloadProgress] = useState<{ current: number; total: number } | null>(null);

    const handleMassDownload = async () => {
        if (!novel || chapters.length === 0) return;

        const undownloaded = chapters.filter(c => !c.content && !c.isRead);
        const targetChapters = undownloaded.length > 0 ? undownloaded : chapters;

        if (targetChapters.length === 0) {
            console.log("[ManhwaSeries] All chapters already downloaded.");
            return;
        }

        console.log(`[ManhwaSeries] Starting mass download of ${targetChapters.length} chapters...`);
        setMassDownloadProgress({ current: 0, total: targetChapters.length });

        // Process in small batches to avoid overwhelming the system/network
        const batchSize = 3;
        let completed = 0;
        
        for (let i = 0; i < targetChapters.length; i += batchSize) {
            const batch = targetChapters.slice(i, i + batchSize);
            await Promise.all(batch.map(ch => handleDownload(ch)));
            
            completed += batch.length;
            setMassDownloadProgress({ current: Math.min(completed, targetChapters.length), total: targetChapters.length });

            if (i + batchSize < targetChapters.length) {
                await new Promise(resolve => setTimeout(resolve, 1500));
            }
        }

        setMassDownloadProgress(null);
        showToast(`Downloaded ${targetChapters.length} chapters`, "success");
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
            className="min-h-screen flex flex-col bg-background-light dark:bg-background-dark pb-10"
        >
            {/* Dynamic Animated Header */}
            <motion.div
                initial={false}
                animate={{ y: showHeader ? 0 : -100 }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
                className="fixed top-0 left-0 right-0 z-50 pointer-events-none"
            >
                {/* Background layer: Gradient (Top of page) */}
                <div 
                    className={`absolute inset-0 transition-opacity duration-300 pointer-events-none bg-gradient-to-b from-black/80 via-black/40 to-transparent ${
                        isScrolled ? 'opacity-0' : 'opacity-100'
                    }`}
                />
                
                {/* Background layer: Solid + Blur (Scrolled) */}
                <div 
                    className={`absolute inset-0 transition-opacity duration-300 pointer-events-none bg-background-dark/95 backdrop-blur-md border-b border-white/5 shadow-md shadow-black/20 ${
                        isScrolled ? 'opacity-100' : 'opacity-0'
                    }`}
                />

                <Header
                    title={novel?.title || ''}
                    subtitle={novel?.category || 'Manhwa'}
                    transparent
                    showBack
                    className="text-white pointer-events-auto relative z-10 bg-transparent"
                />
            </motion.div>

            <SeriesHero
                novel={novel}
                onReadNow={handleReadNow}
                onToggleLibrary={handleToggleLibrary}
                chapterCount={chapters.length}
                inLibrary={inLibrary}
                hasStartedReading={hasStartedReading}
            />

            <div className="mt-8 flex-1 flex flex-col">
                <ChapterList
                    chapters={chapters}
                    onChapterSelect={handleChapterSelect}
                    onDownload={handleDownload}
                    onMassDownload={handleMassDownload}
                    currentChapterId={novel.lastReadChapterId}
                    downloadingChapterIds={downloadingChapterIds}
                    failedChapterIds={failedChapterIds}
                    massDownloadProgress={massDownloadProgress}
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
                            className="w-full h-11 bg-primary text-white rounded-lg font-semibold text-sm shadow-lg shadow-primary/30 flex items-center justify-center gap-2 active:scale-[0.98] transition-all border border-white/10"
                        >
                            <Book className="fill-current" size={16} />
                            {hasStartedReading ? 'Continue Reading' : 'Start Reading'}
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {toast && (
                <Toast
                    message={toast.message}
                    type={toast.type}
                    onClose={() => setToast(null)}
                />
            )}
        </motion.div>
    );
};
