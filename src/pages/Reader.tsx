import { useState, useEffect, useRef, useCallback } from 'react';
import { MoreHorizontal, Play, Pause, FastForward, Music, ChevronDown, ChevronUp, RefreshCw, Sparkles, List, Loader2, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { dbService, type Novel, type Chapter } from '../services/db.service';
import { audioService } from '../services/audio.service';
import type { TTSSegment } from '../services/ttsEngine';
import { settingsService } from '../services/settings.service';
import { scraperService } from '../services/scraper.service';
import { CompletionModal } from '../components/CompletionModal';
import { SummaryModal } from '../components/SummaryModal';
import { summarizerService } from '../services/summarizer.service';
import { Header } from '../components/Header';
import { useChapterPullNavigation } from '../hooks/useChapterPullNavigation';
import { ChapterSidebar } from '../components/ChapterSidebar';

export const Reader = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { novelId, chapterId } = useParams();
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [chapter, setChapter] = useState<Chapter | null>(null);
    const [nextChapter, setNextChapter] = useState<Chapter | null>(null);
    const [prevChapter, setPrevChapter] = useState<Chapter | null>(null);
    const [novel, setNovel] = useState<Novel | null>(null);
    const [loading, setLoading] = useState(true);

    // Live browsing mode
    const isLiveMode = !!location.state?.liveMode;
    const liveChapters = (location.state?.chapters || []) as { title: string; url: string }[];
    const liveCurrentIndex = (location.state?.currentIndex ?? 0) as number;
    const [liveError, setLiveError] = useState('');
    const [isSavingOffline, setIsSavingOffline] = useState(false);
    const [isChapterSaved, setIsChapterSaved] = useState(false);

    // Visual indicators state (Decoupled from core gesture logic)
    const [pullDistance, setPullDistance] = useState(0);
    const [pushDistance, setPushDistance] = useState(0);
    const [navigationDirection, setNavigationDirection] = useState<'next' | 'prev' | null>(null);
    const PULL_THRESHOLD = 120;

    // Audio State
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isMusicPlaying, setIsMusicPlaying] = useState(false);
    const [currentSegment, setCurrentSegment] = useState<TTSSegment | null>(null);

    // User Settings State (Global)
    const [settings, setSettings] = useState(settingsService.getSettings());
    const [showSettings, setShowSettings] = useState(false);
    const [showComingSoon, setShowComingSoon] = useState(false);
    const [isResyncing, setIsResyncing] = useState(false);

    // Summary State
    const [showSummary, setShowSummary] = useState(false);
    const [summaryData, setSummaryData] = useState<{ extractive: string; events: string[] } | null>(null);
    const [isSummarizing, setIsSummarizing] = useState(false);

    // Chapter Sidebar State
    const [showChapterSidebar, setShowChapterSidebar] = useState(false);
    const [allChapters, setAllChapters] = useState<Chapter[]>([]);
    const swipeStartXRef = useRef(0);

    const theme = settings.theme;
    const font = settings.fontFamily;
    const fontSize = settings.fontSize;

    // Reset summary when chapter changes
    useEffect(() => {
        setSummaryData(null);
        setShowSummary(false);
    }, [chapterId, location.state?.chapterUrl]);

    useEffect(() => {
        if (isLiveMode) {
            setIsChapterSaved(false);
            loadLiveData();
        } else if (novelId && chapterId) {
            loadData(novelId, chapterId);
        } else {
            console.warn("[Reader] Missing novelId or chapterId");
            setLoading(false);
        }

        // Sync with global audio state
        const audioUnsub = audioService.subscribe((state) => {
            setIsSpeaking(state.isTtsPlaying && !state.isTtsPaused);
            setIsMusicPlaying(state.isBgmPlaying);
            setCurrentSegment(state.currentSegment);
        });

        // Sync with global app settings
        const settingsUnsub = settingsService.subscribe((newSettings) => {
            setSettings(newSettings);
        });

        return () => {
            audioUnsub();
            settingsUnsub();
        };
    }, [novelId, chapterId, location.state]);

    // TTS text highlighting effect - highlights current segment by wrapping it
    useEffect(() => {
        const contentEl = document.getElementById('reader-content-container');
        if (!contentEl || !currentSegment || !isSpeaking) {
            // Remove any existing highlights
            const existing = document.querySelectorAll('.tts-highlight');
            existing.forEach(el => {
                const parent = el.parentNode;
                if (parent) {
                    parent.replaceChild(document.createTextNode(el.textContent || ''), el);
                    parent.normalize();
                }
            });
            return;
        }

        // Find and highlight the segment text
        const segmentText = currentSegment.text;
        const walker = document.createTreeWalker(contentEl, NodeFilter.SHOW_TEXT, null);

        let node;
        let found = false;

        // Remove old highlights first
        const oldHighlights = contentEl.querySelectorAll('.tts-highlight');
        oldHighlights.forEach(el => {
            const parent = el.parentNode;
            if (parent) {
                parent.replaceChild(document.createTextNode(el.textContent || ''), el);
                parent.normalize();
            }
        });

        // Walk text nodes to find segment
        while ((node = walker.nextNode()) && !found) {
            const text = node.textContent || '';
            const index = text.indexOf(segmentText);

            if (index !== -1) {
                // Found! Split and wrap
                const before = text.slice(0, index);
                const match = text.slice(index, index + segmentText.length);
                const after = text.slice(index + segmentText.length);

                const parent = node.parentNode;
                if (parent) {
                    const fragment = document.createDocumentFragment();
                    if (before) fragment.appendChild(document.createTextNode(before));

                    const highlight = document.createElement('span');
                    highlight.className = 'tts-highlight';
                    highlight.textContent = match;
                    fragment.appendChild(highlight);

                    if (after) fragment.appendChild(document.createTextNode(after));

                    parent.replaceChild(fragment, node);

                    // Scroll highlight into view
                    highlight.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    found = true;
                }
            }
        }
    }, [currentSegment, isSpeaking]);

    const loadData = async (nid: string, cid: string) => {
        setLoading(true);
        try {
            await dbService.initialize();
            const cData = await dbService.getChapter(nid, cid);
            setChapter(cData);
            const nData = await dbService.getNovel(nid);
            setNovel(nData);

            if (cData) {
                // AUTO-FETCH: If chapter is empty but has a source URL (stub), fetch it now
                if ((!cData.content || cData.content.length < 50) && cData.audioPath && cData.audioPath.startsWith('http')) {
                    console.log(`[Reader] Empty chapter detected, auto-fetching content from ${cData.audioPath}`);
                    try {
                        const fetchedContent = await scraperService.fetchChapterContent(cData.audioPath);
                        if (fetchedContent && fetchedContent.length > 50) {
                            cData.content = fetchedContent;
                            setChapter({ ...cData }); // Update UI immediately

                            // Persist to DB (and Filesystem)
                            await dbService.updateChapterContent(nid, cid, fetchedContent);
                        }
                    } catch (fetchErr) {
                        console.warn("[Reader] Auto-fetch failed", fetchErr);
                    }
                }

                // Fetch surrounding local chapters
                const [next, prev] = await Promise.all([
                    dbService.getNextChapter(nid, cData.orderIndex),
                    dbService.getPrevChapter(nid, cData.orderIndex)
                ]);
                setNextChapter(next);
                setPrevChapter(prev);

                // Fetch all local chapters for the sidebar initially
                const localChapters = await dbService.getChapters(nid);
                setAllChapters(localChapters);

                // Update reading progress (marks chapter as read + updates lastReadChapterId)
                await dbService.updateReadingProgress(nid, cid);

                // HYBRID SYNC: If novel has a sourceUrl, fetch the full web index in background
                if (nData?.sourceUrl) {
                    console.log(`[Reader] Triggering background live sync for ${nid}`);
                    try {
                        await scraperService.fetchNovelFast(nData.sourceUrl, (webChapters) => {
                            // Update sidebar and navigation state with full web list
                            setAllChapters(webChapters.map((ch, idx) => ({
                                id: ch.url,
                                novelId: nid,
                                title: ch.title,
                                orderIndex: idx,
                                isRead: 0 // UI will overlay DB status via IDs
                            } as Chapter)));

                            // Find current chapter in web list to identify its index
                            const currentIndex = webChapters.findIndex(ch => ch.url === cData.audioPath || ch.title === cData.title);
                            if (currentIndex !== -1) {
                                // If we don't have a local next chapter, use the web one
                                if (!next && currentIndex < webChapters.length - 1) {
                                    const nextWeb = webChapters[currentIndex + 1];
                                    setNextChapter({
                                        id: nextWeb.url,
                                        novelId: nid,
                                        title: nextWeb.title,
                                        orderIndex: currentIndex + 1,
                                    } as Chapter);
                                }

                                // Store live metadata in state for unified navigation logic
                                location.state = {
                                    ...location.state,
                                    chapters: webChapters,
                                    currentIndex: currentIndex,
                                    liveMode: true // Enable live navigation features
                                };
                            }
                        });
                    } catch (syncErr) {
                        console.warn("[Reader] Background sync failed", syncErr);
                    }
                }
            }
        } catch (error) {
            console.error('Failed to load chapter:', error);
        } finally {
            setLoading(false);
        }
    };

    // Generate a stable novel ID from the sourceUrl (unifies with library IDs)
    const getStableNovelId = useCallback(() => {
        const sourceUrl = novel?.sourceUrl || location.state?.novel?.sourceUrl || location.state?.novelSourceUrl || '';
        if (!sourceUrl) return 'live';
        // Create a simple slug from the URL path
        const path = sourceUrl.replace(/https?:\/\/[^\/]+/, '').replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        return `live-${path}`.slice(0, 80);
    }, [novel?.sourceUrl, location.state]);

    // Live mode: fetch chapter content from web
    const loadLiveData = async () => {
        setLoading(true);
        setLiveError('');
        const chapterUrl = location.state?.chapterUrl || (chapterId?.startsWith('http') ? chapterId : '');
        const chapterTitle = location.state?.chapterTitle || 'Chapter';
        const novelTitle = location.state?.novelTitle || 'Novel';
        const novelCoverUrl = location.state?.novelCoverUrl || '';
        const stableNovelId = getStableNovelId();
        const chapterStableId = `${stableNovelId}-ch-${liveCurrentIndex}`;

        try {
            await dbService.initialize();

            // 1. Check if chapter already exists in DB (persistent download verification)
            const existingChapter = await dbService.getChapter(stableNovelId, chapterStableId);
            let content = '';

            if (existingChapter && existingChapter.content) {
                content = existingChapter.content;
                setIsChapterSaved(true);
                console.log(`[Reader] Using persistent content for ${chapterStableId}`);
            } else {
                // 2. Fetch live content
                setIsChapterSaved(false);
                content = await scraperService.fetchChapterContent(chapterUrl);
            }

            // Create chapter object for rendering (using stable IDs if possible)
            const newChapter = {
                id: chapterStableId,
                novelId: stableNovelId,
                title: chapterTitle,
                content: content || '',
                orderIndex: liveCurrentIndex,
                audioPath: chapterUrl, // original URL
            } as Chapter;

            console.log('[Reader] Loaded Live Data:', {
                id: newChapter.id,
                audioPath: newChapter.audioPath,
                contentLength: newChapter.content?.length
            });

            setChapter(newChapter);

            // Set novel info
            setNovel({
                id: stableNovelId,
                title: novelTitle,
                author: '',
                coverUrl: novelCoverUrl,
                sourceUrl: location.state?.novelSourceUrl || '',
                summary: '',
                status: 'Ongoing',
            } as Novel);

            // Set next/prev from live chapters list
            if (liveCurrentIndex < liveChapters.length - 1) {
                const next = liveChapters[liveCurrentIndex + 1];
                setNextChapter({
                    id: next.url, // Keep URL for live navigation
                    novelId: stableNovelId,
                    title: next.title,
                    orderIndex: liveCurrentIndex + 1,
                } as Chapter);
            } else {
                setNextChapter(null);
            }

            if (liveCurrentIndex > 0) {
                const prev = liveChapters[liveCurrentIndex - 1];
                setPrevChapter({
                    id: prev.url,
                    novelId: stableNovelId,
                    title: prev.title,
                    orderIndex: liveCurrentIndex - 1,
                } as Chapter);
            } else {
                setPrevChapter(null);
            }

            // Build sidebar chapters list with read status from DB
            try {
                const dbChapters = await dbService.getChapters(stableNovelId);
                const readStatusMap = new Set(dbChapters.filter(c => c.isRead).map(c => c.id));

                setAllChapters(liveChapters.map((ch, idx) => {
                    // Hybrid ID matching: try both URL and stable ID format
                    const stableId = `${stableNovelId}-ch-${idx}`;
                    const isRead = readStatusMap.has(stableId) || readStatusMap.has(ch.url);

                    return {
                        id: ch.url,
                        novelId: stableNovelId,
                        title: ch.title,
                        orderIndex: idx,
                        isRead: isRead ? 1 : 0
                    } as Chapter;
                }));
            } catch (e) {
                console.warn("[Reader] Failed to sync read status for sidebar", e);
                // Fallback to simple list
                setAllChapters(liveChapters.map((ch, idx) => ({
                    id: ch.url,
                    novelId: stableNovelId,
                    title: ch.title,
                    orderIndex: idx,
                } as Chapter)));
            }

            // 3. Mark as read / update history if novel is in library
            const novelInDB = await dbService.getNovel(stableNovelId);
            if (novelInDB) {
                // Ensure the chapter record exists in DB (stub without full content if not downloaded)
                const existingCh = await dbService.getChapter(stableNovelId, chapterStableId);
                if (!existingCh) {
                    await dbService.addChapter({
                        id: chapterStableId,
                        novelId: stableNovelId,
                        title: chapterTitle,
                        content: '', // No content stored (not downloaded)
                        orderIndex: liveCurrentIndex,
                        audioPath: chapterUrl,
                    } as any);
                }
                await dbService.updateReadingProgress(stableNovelId, chapterStableId);
                console.log(`[Reader] Progress updated for library novel: ${stableNovelId}`);
            }

        } catch (error) {
            console.error('Failed to load live chapter:', error);
            setLiveError('Failed to fetch chapter content. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleNextChapter = useCallback(() => {
        const canNavigateLive = (isLiveMode || !!novel?.sourceUrl) && location.state?.chapters?.length > 0;
        const stateCurrentIndex = location.state?.currentIndex ?? -1;

        if (canNavigateLive && stateCurrentIndex !== -1 && stateCurrentIndex < location.state.chapters.length - 1) {
            const next = location.state.chapters[stateCurrentIndex + 1];
            setNavigationDirection('next');
            navigate(`/read/live/${encodeURIComponent(next.url)}`, {
                state: {
                    ...location.state,
                    chapterUrl: next.url,
                    chapterTitle: next.title,
                    currentIndex: stateCurrentIndex + 1,
                },
                replace: true
            });
            setShowSettings(false);
        } else if (nextChapter) {
            setNavigationDirection('next');
            const targetUrl = nextChapter.id.startsWith('http')
                ? `/read/live/${encodeURIComponent(nextChapter.id)}`
                : `/read/${novelId}/${nextChapter.id}`;

            navigate(targetUrl, {
                state: {
                    ...location.state,
                    chapterUrl: nextChapter.id.startsWith('http') ? nextChapter.id : '',
                    chapterTitle: nextChapter.title,
                    currentIndex: (location.state?.currentIndex ?? -1) + 1,
                },
                replace: true
            });
            setShowSettings(false);
        } else {
            setShowComingSoon(true);
        }
    }, [nextChapter, novelId, navigate, isLiveMode, novel?.sourceUrl, location.state]);

    const handlePrevChapter = useCallback(() => {
        const canNavigateLive = (isLiveMode || !!novel?.sourceUrl) && location.state?.chapters?.length > 0;
        const stateCurrentIndex = location.state?.currentIndex ?? -1;

        if (canNavigateLive && stateCurrentIndex > 0) {
            const prev = location.state.chapters[stateCurrentIndex - 1];
            setNavigationDirection('prev');
            navigate(`/read/live/${encodeURIComponent(prev.url)}`, {
                state: {
                    ...location.state,
                    chapterUrl: prev.url,
                    chapterTitle: prev.title,
                    currentIndex: stateCurrentIndex - 1,
                },
                replace: true
            });
            setShowSettings(false);
        } else if (prevChapter) {
            setNavigationDirection('prev');
            const targetUrl = prevChapter.id.startsWith('http')
                ? `/read/live/${encodeURIComponent(prevChapter.id)}`
                : `/read/${novelId}/${prevChapter.id}`;

            navigate(targetUrl, {
                state: {
                    ...location.state,
                    chapterUrl: prevChapter.id.startsWith('http') ? prevChapter.id : '',
                    chapterTitle: prevChapter.title,
                    currentIndex: (location.state?.currentIndex ?? 1) - 1,
                },
                replace: true
            });
            setShowSettings(false);
        }
    }, [prevChapter, novelId, navigate, isLiveMode, novel?.sourceUrl, location.state]);

    // Save current live chapter to DB for offline reading
    const handleSaveOffline = async () => {
        if (!isLiveMode || !chapter || isSavingOffline || isChapterSaved) return;
        setIsSavingOffline(true);
        try {
            const novelSourceUrl = novel?.sourceUrl || location.state?.novel?.sourceUrl || '';
            // Generate stable ID from URL
            const path = novelSourceUrl.replace(/https?:\/\/[^\/]+/, '').replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
            const novelDbId = `live-${path}`.slice(0, 80);

            await dbService.initialize();
            // Ensure novel exists in DB
            await dbService.addNovel({
                id: novelDbId,
                title: location.state?.novelTitle || novel?.title || 'Unknown Novel',
                author: '',
                coverUrl: location.state?.novelCoverUrl || novel?.coverUrl || '',
                sourceUrl: novelSourceUrl,
                summary: '',
                status: 'Ongoing',
                source: 'NovelFire',
                category: 'Novel',
            } as any);

            // Save current chapter
            const chapterUrl = location.state?.chapterUrl || '';
            await dbService.addChapter({
                id: `${novelDbId}-ch-${liveCurrentIndex}`,
                novelId: novelDbId,
                title: chapter.title,
                content: chapter.content || '',
                orderIndex: liveCurrentIndex,
                audioPath: chapterUrl,
            });
            setIsChapterSaved(true);
        } catch (error) {
            console.error('Failed to save chapter offline:', error);
        } finally {
            setIsSavingOffline(false);
        }
    };

    // STABLE GESTURE NAVIGATION SYSTEM (FSM + Async Locking)
    const { onTouchStart, onTouchMove, onTouchEnd } = useChapterPullNavigation({
        containerRef: scrollContainerRef,
        hasPrev: !!prevChapter,
        hasNext: !!nextChapter,
        onLoadPrev: handlePrevChapter,
        onLoadNext: handleNextChapter,
        activeChapterId: chapterId,
        isLoading: loading,
        onPulling: (dist, dir) => {
            // Update visual indicators based on normalized distance
            const resistance = 0.45;
            if (dir === 'prev') {
                setPullDistance(dist * resistance);
                setPushDistance(0);
            } else if (dir === 'next') {
                setPushDistance(dist * resistance);
                setPullDistance(0);
            } else {
                setPullDistance(0);
                setPushDistance(0);
            }
        }
    });

    const handleBackToIndex = () => {
        if (isLiveMode) {
            navigate(-1);
        } else {
            navigate(`/novel/${novelId}`);
        }
    };

    // Resync chapter content handler
    const handleResyncChapter = async () => {
        // audioPath stores the original chapter URL
        if (!chapter?.audioPath || isResyncing) return;
        setIsResyncing(true);
        try {
            const newContent = await scraperService.fetchChapterContent(chapter.audioPath);
            if (newContent && newContent.length > 100) {
                await dbService.updateChapterContent(novelId!, chapter.id, newContent);
                // Reload the chapter
                const updatedChapter = await dbService.getChapter(novelId!, chapter.id);
                setChapter(updatedChapter);
            }
        } catch (error) {
            console.error('Failed to resync chapter:', error);
        } finally {
            setIsResyncing(false);
        }
    };


    const toggleTTS = () => {
        if (isSpeaking) {
            audioService.pause();
        } else {
            if (audioService.currentState.isTtsPaused) {
                audioService.resume();
            } else if (chapter?.content) {
                // Ensure content is loaded and strip minimal HTML if needed, though audioService handles it
                audioService.speak(chapter.content, chapter.title, novel?.title || 'Unknown Novel', novel?.coverUrl);
            }
        }
    };

    const toggleMusic = () => {
        if (isMusicPlaying) {
            audioService.stopBGM();
            setIsMusicPlaying(false);
        } else {
            const currentAmbience = audioService.getAmbienceTrack();
            if (currentAmbience) {
                audioService.playAmbience(currentAmbience);
            } else {
                audioService.playBGM('fantasy');
            }
            setIsMusicPlaying(true);
        }
    };

    const getThemeClass = () => {
        switch (theme) {
            case 'sepia': return 'reader-content-sepia';
            case 'light': return 'reader-content-light';
            case 'oled': return 'reader-content-oled';
            default: return 'reader-content-dark';
        }
    };

    const handleShowSummary = async () => {
        if (!chapter || !chapter.content) return;

        setShowSettings(false);
        setShowSummary(true);

        // Check if we already have it in memory or DB
        if (summaryData && summaryData.extractive) return;

        setIsSummarizing(true);
        try {
            // 1. Check DB for cached summary
            const cachedExtractive = await dbService.getSummary(chapter.id, 'extractive');
            const cachedEventsStr = await dbService.getSummary(chapter.id, 'events');

            if (cachedExtractive && cachedEventsStr) {
                setSummaryData({
                    extractive: cachedExtractive,
                    events: JSON.parse(cachedEventsStr)
                });
            } else {
                // 2. Generate if not found (strip HTML for processing)
                const div = document.createElement('div');
                div.innerHTML = chapter.content;
                const textContent = div.textContent || div.innerText || '';

                const result = summarizerService.summarize(textContent);
                setSummaryData(result);

                // 3. Save to DB
                await Promise.all([
                    dbService.saveSummary(chapter.id, 'extractive', result.extractive),
                    dbService.saveSummary(chapter.id, 'events', JSON.stringify(result.events))
                ]);
            }
        } catch (error) {
            console.error("Summary generation failed", error);
        } finally {
            setIsSummarizing(false);
        }
    };

    // Mobile-friendly double-tap detector
    const lastTapRef = useRef<number>(0);
    const handleDoubleTap = useCallback((e: React.MouseEvent | React.TouchEvent) => {
        const target = e.target as HTMLElement;
        // Ignore taps on interactive elements
        if (target.closest('button') || target.closest('input') || target.closest('.settings-menu') || target.closest('a')) {
            return;
        }

        const now = Date.now();
        const DOUBLE_TAP_DELAY = 300;
        if (now - lastTapRef.current < DOUBLE_TAP_DELAY) {
            setShowSettings(prev => !prev);
            lastTapRef.current = 0; // Reset
        } else {
            lastTapRef.current = now;
        }
    }, []);

    const fontSizes = [
        { label: '14', value: 0.875 },
        { label: '16', value: 1 },
        { label: '18', value: 1.125 },
        { label: '22', value: 1.375 },
    ];

    if (loading) {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-background-light dark:bg-background-dark text-primary">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
        );
    }

    if (!chapter) {
        if (isLiveMode && liveError) {
            return (
                <div className="flex h-screen w-full items-center justify-center bg-background-light dark:bg-background-dark flex-col gap-4">
                    <p className="text-sm text-red-500 dark:text-red-400 text-center px-8">{liveError}</p>
                    <button onClick={() => loadLiveData()} className="text-primary font-bold">Retry</button>
                    <button onClick={() => navigate(-1)} className="text-slate-400 font-medium text-sm">Go Back</button>
                </div>
            );
        }
        return (
            <div className="flex h-screen w-full items-center justify-center bg-background-light dark:bg-background-dark flex-col gap-4">
                <p className="text-xl font-bold opacity-50">Chapter not found</p>
                <button onClick={() => navigate(-1)} className="text-primary font-bold">Go Back</button>
            </div>
        );
    }

    return (
        <div
            className={`relative flex h-screen w-full flex-col bg-background-light dark:bg-background-dark overflow-hidden ${getThemeClass()}`}
        >
            {/* Top App Bar using Global Header */}
            <Header
                title={chapter.title}
                subtitle={isLiveMode ? `Chapter ${liveCurrentIndex + 1}` : `Chapter ${chapter.orderIndex + 1}`}
                showBack={true}
                onBack={handleBackToIndex}
                transparent
                withBorder
                className="bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md"
                rightActions={
                    <button onClick={() => setShowSettings(!showSettings)} className="flex items-center justify-center size-10 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors">
                        <MoreHorizontal />
                    </button>
                }
            />

            {/* Main Reading Area */}
            <div
                ref={scrollContainerRef}
                className={`flex-1 overflow-y-auto px-6 py-8 ${getThemeClass()} relative`}
                onTouchStart={(e) => {
                    swipeStartXRef.current = e.touches[0].clientX;
                    onTouchStart(e);
                }}
                onTouchMove={onTouchMove}
                onTouchEnd={(e) => {
                    // Detect left swipe from left edge (60px zone for better touch detection)
                    const endX = e.changedTouches[0].clientX;
                    const diffX = endX - swipeStartXRef.current;
                    const startedFromLeftEdge = swipeStartXRef.current < 60;

                    if (startedFromLeftEdge && diffX > 80) {
                        setShowChapterSidebar(true);
                    }

                    handleDoubleTap(e);
                    onTouchEnd();
                }}
                onClick={handleDoubleTap}
                onScroll={(e) => {
                    const target = e.currentTarget;
                    if (nextChapter && target.scrollHeight - target.scrollTop - target.clientHeight < 50) {
                        // Near bottom - could trigger auto-load or show hint
                    }
                }}
            >
                {/* Pull to Previous Indicator */}
                {pullDistance > 10 && (
                    <motion.div
                        style={{ height: pullDistance, opacity: Math.min(pullDistance / PULL_THRESHOLD, 1) }}
                        className="flex flex-col items-center justify-end pb-4 overflow-hidden pointer-events-none"
                    >
                        <motion.div
                            animate={{ y: pullDistance > PULL_THRESHOLD ? [0, -4, 0] : 0 }}
                            className="flex flex-col items-center gap-1.5"
                        >
                            <ChevronDown className={clsx("transition-all duration-300", pullDistance > PULL_THRESHOLD ? "text-primary scale-125 rotate-180" : "text-gray-400")} />
                            <p className={clsx("text-[10px] font-black uppercase tracking-[0.2em] bg-background-light dark:bg-background-dark px-4 py-1.5 rounded-full border shadow-sm transition-colors", pullDistance > PULL_THRESHOLD ? "text-primary border-primary/40 shadow-primary/10" : "text-gray-500 border-gray-100 dark:border-gray-800")}>
                                {pullDistance > PULL_THRESHOLD
                                    ? (prevChapter ? "Release" : "At Start")
                                    : (prevChapter ? "Pull for Prev" : "First Chapter")}
                            </p>
                        </motion.div>
                    </motion.div>
                )}

                <AnimatePresence mode="wait" initial={false} custom={navigationDirection}>
                    <motion.div
                        key={chapter.id}
                        custom={navigationDirection}
                        variants={{
                            initial: (direction: string) => ({
                                opacity: 0,
                                y: direction === 'next' ? 100 : direction === 'prev' ? -100 : 0,
                            }),
                            animate: { opacity: 1, y: 0 },
                            exit: (direction: string) => ({
                                opacity: 0,
                                y: direction === 'next' ? -100 : direction === 'prev' ? 100 : 0,
                            })
                        }}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        transition={{ type: "spring", damping: 25, stiffness: 180 }}
                        className={clsx("max-w-2xl mx-auto space-y-6 reader-text", font === 'serif' ? 'font-serif' : font === 'sans' ? 'font-sans' : '')}
                        style={{
                            fontSize: `${fontSize}rem`,
                            fontFamily: font === 'comfortable' ? 'Georgia, "Merriweather", "Palatino Linotype", "Book Antiqua", Inter, Roboto, serif' : undefined
                        }}
                    >
                        <div id="reader-content-container" dangerouslySetInnerHTML={{ __html: chapter.content || '' }} />

                        {/* End of Chapter - Next Chapter Hint */}
                        {nextChapter && (
                            <div
                                className="mt-12 mb-8 flex flex-col items-center gap-3 pt-8 border-t border-dashed border-slate-300 dark:border-slate-700 cursor-pointer active:opacity-70 transition-opacity"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleNextChapter();
                                }}
                            >
                                <p className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-widest font-semibold">Tap or swipe up for next chapter</p>
                                <div className="flex flex-col items-center animate-bounce">
                                    <ChevronDown size={24} className="text-primary" />
                                </div>
                                <p className="text-sm text-slate-500 dark:text-slate-400 text-center max-w-xs line-clamp-1 font-medium">
                                    {nextChapter.title}
                                </p>
                            </div>
                        )}

                        {/* End of Novel Indicator */}
                        {!nextChapter && (
                            <div className="mt-12 mb-8 flex flex-col items-center gap-3 pt-8 border-t border-dashed border-slate-300 dark:border-slate-700">
                                <p className="text-sm text-slate-500 dark:text-slate-400 font-semibold">🎉 You've reached the end!</p>
                                <p className="text-xs text-slate-400 dark:text-slate-500">No more chapters available</p>
                            </div>
                        )}
                    </motion.div>
                </AnimatePresence>



                {/* Pull Up to Next Indicator */}
                {pushDistance > 10 && (
                    <motion.div
                        style={{ height: pushDistance, opacity: Math.min(pushDistance / PULL_THRESHOLD, 1) }}
                        className="flex flex-col items-center justify-start pt-4 overflow-hidden pointer-events-none"
                    >
                        <motion.div
                            animate={{ y: pushDistance > PULL_THRESHOLD ? [0, 4, 0] : 0 }}
                            className="flex flex-col items-center gap-1.5"
                        >
                            <p className={clsx("text-[10px] font-black uppercase tracking-[0.2em] bg-background-light dark:bg-background-dark px-4 py-1.5 rounded-full border shadow-sm transition-colors", pushDistance > PULL_THRESHOLD ? "text-primary border-primary/40 shadow-primary/10" : "text-gray-500 border-gray-100 dark:border-gray-800")}>
                                {pushDistance > PULL_THRESHOLD
                                    ? (nextChapter ? "Release" : "At End")
                                    : (nextChapter ? "Pull for Next" : "End of Story")}
                            </p>
                            <ChevronUp className={clsx("transition-all duration-300", pushDistance > PULL_THRESHOLD ? "text-primary scale-125 rotate-180" : "text-gray-400")} />
                        </motion.div>
                    </motion.div>
                )}

                {/* Extra Padding Removed */}
            </div>


            {/* AI Music Indicator */}
            {
                isMusicPlaying && (
                    <div className="absolute bottom-64 left-4 bg-primary/20 backdrop-blur-md border border-primary/30 rounded-lg p-2 flex items-center gap-3 animate-in fade-in slide-in-from-left">
                        <div className="size-8 bg-primary rounded-md flex items-center justify-center">
                            <Music className="text-white text-sm animate-pulse" size={16} />
                        </div>
                        <div>
                            <p className="text-[10px] text-primary-200 uppercase font-bold tracking-tighter">AI Soundtrack</p>
                            <p className="text-xs text-white font-medium">Fantasy Ambient</p>
                        </div>
                    </div>
                )
            }

            {/* Customization Overlay */}
            <AnimatePresence>
                {showSettings && (
                    <>
                        {/* Backdrop to close settings on click outside */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-10 bg-black/20 backdrop-blur-sm"
                            onClick={() => setShowSettings(false)}
                        />

                        <motion.div
                            initial={{ y: "100%" }}
                            animate={{ y: 0 }}
                            exit={{ y: "100%" }}
                            transition={{ type: "spring", damping: 25, stiffness: 200 }}
                            className="settings-menu absolute bottom-0 left-0 w-full bg-white dark:bg-[#1a182b] rounded-t-3xl shadow-2xl border-t border-white/10 z-20 overflow-hidden"
                        >
                            {/* Grab Handle */}
                            <div className="flex justify-center py-3" onClick={() => setShowSettings(false)}>
                                <div className="w-10 h-1 bg-gray-300 dark:bg-gray-700 rounded-full"></div>
                            </div>
                            <div className="px-6 pb-10 space-y-6">
                                {/* TTS Controls */}
                                <div className="flex items-center justify-between gap-4">
                                    <button onClick={toggleMusic} className={clsx("flex-1 flex items-center justify-center gap-2 h-12 rounded-xl  font-semibold transition-colors", isMusicPlaying ? "bg-primary/20 text-primary border border-primary/50" : "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white")}>
                                        <Music size={20} />
                                        <span className="text-xs">{isMusicPlaying ? 'On' : 'Off'}</span>
                                    </button>
                                    <button onClick={toggleTTS} className="size-16 flex items-center justify-center bg-primary rounded-full shadow-lg shadow-primary/40 active:scale-95 transition-transform">
                                        {isSpeaking ? <Pause className="text-white fill-white" size={32} /> : <Play className="text-white fill-white ml-1" size={32} />}
                                    </button>
                                    <button
                                        onClick={handleNextChapter}
                                        disabled={!nextChapter}
                                        className={clsx("flex-1 flex items-center justify-center gap-2 h-12 rounded-xl text-gray-900 dark:text-white font-semibold transition-opacity px-4 bg-gray-100 dark:bg-gray-800", !nextChapter && "opacity-30")}
                                    >
                                        <FastForward size={20} />
                                        <span className="text-xs">Next</span>
                                    </button>
                                </div>

                                {/* Quick Actions Grid */}
                                <div className="grid grid-cols-3 gap-2">
                                    <button
                                        onClick={() => {
                                            setShowSettings(false);
                                            setShowChapterSidebar(true);
                                        }}
                                        className="flex flex-col items-center justify-center gap-1.5 h-16 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold transition-colors active:scale-95"
                                    >
                                        <List size={20} />
                                        <span className="text-[10px]">Contents</span>
                                    </button>
                                    <button
                                        onClick={handleShowSummary}
                                        className="flex flex-col items-center justify-center gap-1.5 h-16 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-300 font-bold border border-indigo-200 dark:border-indigo-800 transition-colors active:scale-95"
                                    >
                                        <Sparkles size={20} />
                                        <span className="text-[10px]">Summary</span>
                                    </button>
                                    {!isLiveMode && (
                                        <button
                                            onClick={handleResyncChapter}
                                            disabled={isResyncing || !chapter?.audioPath}
                                            className={clsx(
                                                "flex flex-col items-center justify-center gap-1.5 h-16 rounded-xl font-bold transition-colors active:scale-95",
                                                isResyncing
                                                    ? "bg-primary/20 text-primary border border-primary/50"
                                                    : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200",
                                                !chapter?.audioPath && "opacity-30"
                                            )}
                                        >
                                            <RefreshCw size={20} className={isResyncing ? "animate-spin" : ""} />
                                            <span className="text-[10px]">{isResyncing ? 'Syncing...' : 'Resync'}</span>
                                        </button>
                                    )}
                                    {isLiveMode && (
                                        <button
                                            onClick={handleSaveOffline}
                                            disabled={isSavingOffline || isChapterSaved}
                                            className={clsx(
                                                "flex flex-col items-center justify-center gap-1.5 h-16 rounded-xl font-bold transition-colors active:scale-95",
                                                isChapterSaved
                                                    ? "bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-800"
                                                    : isSavingOffline
                                                        ? "bg-primary/20 text-primary border border-primary/50"
                                                        : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                                            )}
                                        >
                                            {isSavingOffline ? (
                                                <Loader2 size={20} className="animate-spin" />
                                            ) : isChapterSaved ? (
                                                <Download size={20} />
                                            ) : (
                                                <Download size={20} />
                                            )}
                                            <span className="text-[10px]">{isChapterSaved ? 'Saved' : isSavingOffline ? 'Saving...' : 'Save'}</span>
                                        </button>
                                    )}
                                </div>

                                {/* Font Customization */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Font Style</p>
                                        <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
                                            <button
                                                onClick={() => settingsService.updateSettings({ fontFamily: 'serif' })}
                                                className={clsx("flex-1 py-1.5 text-xs font-bold rounded shadow-sm transition-colors", font === 'serif' ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white" : "text-gray-500")}
                                            >
                                                Serif
                                            </button>
                                            <button
                                                onClick={() => settingsService.updateSettings({ fontFamily: 'sans' })}
                                                className={clsx("flex-1 py-1.5 text-xs font-bold rounded shadow-sm transition-colors", font === 'sans' ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white" : "text-gray-500")}
                                            >
                                                Sans
                                            </button>
                                            <button
                                                onClick={() => settingsService.updateSettings({ fontFamily: 'comfortable' })}
                                                className={clsx("flex-1 py-1.5 text-xs font-bold rounded shadow-sm transition-colors", font === 'comfortable' ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white" : "text-gray-500")}
                                            >
                                                Soft
                                            </button>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Font Size (px)</p>
                                        <div className="flex items-center justify-between bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
                                            {fontSizes.map((size) => (
                                                <button
                                                    key={size.label}
                                                    onClick={() => settingsService.updateSettings({ fontSize: size.value })}
                                                    className={clsx("size-8 text-[10px] font-black rounded-lg transition-all", fontSize === size.value ? "bg-primary text-white shadow-lg shadow-primary/30 scale-110" : "text-gray-400 hover:text-gray-600")}
                                                >
                                                    {size.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* Theme Selection */}
                                <div className="space-y-3">
                                    <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Reading Theme</p>
                                    <div className="grid grid-cols-4 gap-3">
                                        {[
                                            { id: 'light', color: 'bg-white', label: 'Paper' },
                                            { id: 'sepia', color: 'bg-[#f4ecd8]', label: 'Sepia' },
                                            { id: 'dark', color: 'bg-[#1e1e1e]', label: 'Eclipse' },
                                            { id: 'oled', color: 'bg-black', label: 'OLED' },
                                        ].map((t) => (
                                            <button
                                                key={t.id}
                                                onClick={() => settingsService.updateSettings({ theme: t.id as any })}
                                                className={clsx(
                                                    "group flex flex-col items-center gap-2",
                                                    theme === t.id ? "scale-105" : "opacity-60 grayscale-[0.5]"
                                                )}
                                            >
                                                <div className={clsx(
                                                    "size-12 rounded-2xl border-2 transition-all",
                                                    t.color,
                                                    theme === t.id ? "border-primary shadow-lg shadow-primary/20" : "border-transparent"
                                                )} />
                                                <span className={clsx("text-[10px] font-bold uppercase tracking-tighter transition-colors", theme === t.id ? "text-primary" : "text-gray-500")}>
                                                    {t.label}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            <CompletionModal
                isOpen={showComingSoon}
                onClose={() => setShowComingSoon(false)}
                title="Coming Soon!"
                message="Next chapter navigation is being optimized and will be available in the next update."
            />

            <SummaryModal
                isOpen={showSummary}
                onClose={() => setShowSummary(false)}
                summary={summaryData}
                isLoading={isSummarizing}
            />

            {/* Chapter Sidebar */}
            <ChapterSidebar
                isOpen={showChapterSidebar}
                onClose={() => setShowChapterSidebar(false)}
                chapters={allChapters}
                currentChapterId={isLiveMode ? (location.state?.chapterUrl || '') : (chapterId || '')}
                novelTitle={novel?.title || ''}
                onSelectChapter={(ch) => {
                    if (isLiveMode) {
                        const idx = liveChapters.findIndex(lc => lc.url === ch.id);
                        navigate(`/read/live/${encodeURIComponent(ch.id)}`, {
                            state: {
                                liveMode: true,
                                chapterUrl: ch.id,
                                chapterTitle: ch.title,
                                novelTitle: location.state?.novelTitle,
                                novelCoverUrl: location.state?.novelCoverUrl,
                                chapters: liveChapters,
                                currentIndex: idx >= 0 ? idx : 0,
                            },
                            replace: true
                        });
                    } else {
                        navigate(`/read/${novelId}/${ch.id}`, { replace: true });
                    }
                }}
            />
        </div >
    );
};
