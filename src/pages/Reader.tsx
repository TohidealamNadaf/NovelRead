import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { MoreHorizontal, Play, Pause, FastForward, Rewind, Music, ChevronDown, ChevronUp, RefreshCw, Sparkles, List, Loader2, Download } from 'lucide-react';
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
    const [novel, setNovel] = useState<Novel | null>(null);
    const [loading, setLoading] = useState(true);

    // Unified Navigation State (Hybrid/Live/Offline)
    const [navChapters, setNavChapters] = useState<(Chapter | any)[]>(
        location.state?.chapters ? [...location.state.chapters] : []
    );
    const [navIndex, setNavIndex] = useState<number>(location.state?.currentIndex ?? -1);

    // Derived Navigation (Primary source of truth for continuity)
    const prevChapter = useMemo(() => {
        if (navIndex > 0 && navChapters.length > 0) {
            return navChapters[navIndex - 1];
        }
        return null;
    }, [navChapters, navIndex]);

    const nextChapter = useMemo(() => {
        if (navIndex !== -1 && navIndex < navChapters.length - 1) {
            return navChapters[navIndex + 1];
        }
        return null;
    }, [navChapters, navIndex]);

    // Live browsing mode indicators
    const isLiveMode = !!location.state?.liveMode || novelId?.startsWith('live-');
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
    const edgeSwipeStartRef = useRef<number | null>(null);
    const [isEdgeSwiping, setIsEdgeSwiping] = useState(false);

    // Edge swipe configuration
    const EDGE_WIDTH = 40; // px from left edge to activate
    const OPEN_THRESHOLD = 50; // px horizontal drag to open sidebar

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

        // --- IMMEDIATE NAVIGATION SYNC ---
        // Sync nav state from router immediately to prevent gesture break during sync
        if (location.state?.chapters) {
            setNavChapters([...location.state.chapters]);
            if (typeof location.state.currentIndex === 'number') {
                setNavIndex(location.state.currentIndex);
            }
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


                // Fetch all local chapters for the sidebar initially
                const localChapters = await dbService.getChapters(nid);
                setAllChapters(localChapters);

                // Restore navigation state if missing (Continue button flow)
                if (navChapters.length === 0 && localChapters.length > 0) {
                    const index = localChapters.findIndex(c => c.id === cid);
                    if (index !== -1) {
                        setNavChapters(localChapters);
                        setNavIndex(index);
                    }
                }

                // Update reading progress (marks chapter as read + updates lastReadChapterId)
                await dbService.updateReadingProgress(nid, cid);

                // HYBRID SYNC / Navigation Recovery: If novel has a sourceUrl, fetch the full web index in background
                if (nData?.sourceUrl) {
                    // console.log(`[Reader] Triggering background live sync for ${nid}`);
                    try {
                        await scraperService.fetchNovelFast(nData.sourceUrl, (webChapters) => {
                            // Update sidebar only
                            setAllChapters(webChapters.map((ch, idx) => ({
                                id: ch.url,
                                novelId: nid,
                                title: ch.title,
                                orderIndex: idx,
                                isRead: 0
                            } as Chapter)));

                            // RULE: Update nav state if empty OR if web index is more complete
                            const webHasMore = webChapters.length > navChapters.length;
                            if (navChapters.length === 0 || webHasMore) {
                                const currentIndex = webChapters.findIndex(ch => ch.url === cData.audioPath || ch.title === cData.title);
                                if (currentIndex !== -1) {
                                    setNavChapters(webChapters);
                                    setNavIndex(currentIndex);
                                } else if (navChapters.length === 0) {
                                    setNavChapters(localChapters);
                                    setNavIndex(cData.orderIndex);
                                }
                            }
                        });
                    } catch (syncErr) {
                        console.warn("[Reader] Background sync failed", syncErr);
                        if (navChapters.length === 0) {
                            setNavChapters(localChapters);
                            setNavIndex(cData.orderIndex);
                        }
                    }
                } else if (navChapters.length === 0) {
                    setNavChapters(localChapters);
                    setNavIndex(cData.orderIndex);
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

        // 1. RECOVERY: If state is missing (refresh), try to reconstruct context
        let currentSourceUrl = location.state?.novel?.sourceUrl || location.state?.novelSourceUrl || novel?.sourceUrl || '';
        let currentLiveChapters = (location.state?.chapters || (navChapters.length > 0 ? navChapters : [])) as any[];

        // SANITIZE: Remove any null/undefined entries that might have polluted the list
        currentLiveChapters = currentLiveChapters.filter(c => !!c);

        let currentIdx = (location.state?.currentIndex ?? (navIndex !== -1 ? navIndex : -1)) as number;

        let stableNovelId = novelId; // Use URL param as primary ID
        if (!stableNovelId || stableNovelId === 'null') {
            // Fallback to generating
            stableNovelId = getStableNovelId();
        }

        try {
            await dbService.initialize();

            // Attempt to restore Novel info from DB if missing
            if (!currentSourceUrl && stableNovelId) {
                const dbNovel = await dbService.getNovel(stableNovelId);
                if (dbNovel && dbNovel.sourceUrl) {
                    currentSourceUrl = dbNovel.sourceUrl;
                    console.log("[Reader] Recovered sourceUrl from DB:", currentSourceUrl);

                    // Restore Web Chapters if missing
                    if (currentLiveChapters.length === 0) {
                        try {
                            const scraped = await scraperService.fetchNovel(currentSourceUrl);
                            if (scraped && scraped.chapters) {
                                currentLiveChapters = scraped.chapters.map((c, i) => ({
                                    ...c,
                                    novelId: stableNovelId!,
                                    id: c.url, // Use URL as temp ID
                                    orderIndex: i,
                                    // Generate stable ID for matching
                                    stableId: `${stableNovelId}-ch-${i}`
                                } as any));
                                console.log("[Reader] Recovered live chapters:", currentLiveChapters.length);
                                setNavChapters(currentLiveChapters);
                            }
                        } catch (e) {
                            console.error("[Reader] Failed to recover live chapters", e);
                        }
                    }
                }
            }

            // Navigation Re-construction Fallback (Recovery Rule)
            if (currentLiveChapters.length === 0 && currentSourceUrl) {
                console.log("[Reader] Missing navChapters in state, fetching live index...");
                try {
                    const novelData = await scraperService.fetchNovelFast(currentSourceUrl);
                    currentLiveChapters = novelData.chapters;
                    currentIdx = currentLiveChapters.findIndex(ch =>
                        ch.url === chapterId ||
                        ch.id === chapterId ||
                        (location.state?.chapterUrl && ch.url === location.state.chapterUrl)
                    );
                    if (currentLiveChapters.length > 0) {
                        setNavChapters(currentLiveChapters);
                    }
                } catch (e) {
                    console.warn("[Reader] Failed to reconstruct live navigation", e);
                }
            }

            // Restore Current Index if missing (Recovery Rule: findIndex ONLY)
            if (currentIdx === -1 && currentLiveChapters.length > 0) {
                currentIdx = currentLiveChapters.findIndex(c =>
                    c.url === chapterId ||
                    c.id === chapterId ||
                    (location.state?.chapterUrl && c.url === location.state.chapterUrl)
                );

                // Fallback to ID-based index parsing as a LAST resort if URL lookup fails
                if (currentIdx === -1 && chapterId) {
                    const match = chapterId.match(/-ch-(\d+)$/);
                    if (match) currentIdx = parseInt(match[1], 10);
                }
            }

            if (currentIdx !== -1) {
                setNavIndex(currentIdx);
            }

            // --- END RECOVERY ---

            // Determine Chapter URL (for fetching content)
            const targetChapter = currentLiveChapters[currentIdx];
            const chapterUrl = location.state?.chapterUrl || (targetChapter as any)?.url || (targetChapter as any)?.audioPath || (chapterId?.startsWith('http') ? chapterId : '');

            // Fallback Title
            const chapterTitle = location.state?.chapterTitle || (targetChapter as any)?.title || 'Chapter';

            const chapterStableId = `${stableNovelId}-ch-${currentIdx !== -1 ? currentIdx : 0}`;

            // 1. Check if chapter already exists in DB (persistent download verification)
            const existingChapter = await dbService.getChapter(stableNovelId!, chapterStableId);
            let content = '';

            if (existingChapter && existingChapter.content) {
                content = existingChapter.content;
                setIsChapterSaved(true);
                console.log(`[Reader] Using persistent content for ${chapterStableId}`);
            } else if (chapterUrl) {
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
                orderIndex: currentIdx,
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
                id: stableNovelId!,
                title: location.state?.novelTitle || (await dbService.getNovel(stableNovelId!)?.then(n => n?.title)) || 'Novel',
                author: '',
                coverUrl: location.state?.novelCoverUrl || '',
                sourceUrl: currentSourceUrl,
                summary: '',
                status: 'Ongoing',
            } as Novel);


            // Build sidebar chapters list with read status from DB
            try {
                const dbChapters = await dbService.getChapters(stableNovelId);
                const readStatusMap = new Set(dbChapters.filter(c => c.isRead).map(c => c.id));

                setAllChapters(currentLiveChapters.map((ch, idx) => {
                    if (!ch) return null; // Safe guard
                    // Hybrid ID matching: try both URL and stable ID format
                    const stableId = `${stableNovelId}-ch-${idx}`;
                    const chUrl = (ch as any).url || (ch as any).audioPath || '';
                    const isRead = readStatusMap.has(stableId) || (chUrl && readStatusMap.has(chUrl));

                    return {
                        id: chUrl,
                        novelId: stableNovelId,
                        title: ch.title || `Chapter ${idx + 1}`,
                        orderIndex: idx,
                        isRead: isRead ? 1 : 0
                    } as Chapter;
                }).filter((c): c is Chapter => !!c));
            } catch (e) {
                console.warn("[Reader] Failed to sync read status for sidebar", e);
                // Fallback to simple list
                setAllChapters(currentLiveChapters.map((ch, idx) => ({
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
                        orderIndex: currentIdx,
                        audioPath: chapterUrl,
                    } as any);
                }
                await dbService.updateReadingProgress(stableNovelId, chapterStableId);
                console.log(`[Reader] Progress updated for library novel: ${stableNovelId}`);
            }

            // Sync back to unified state
            setNavChapters(currentLiveChapters);
            setNavIndex(currentIdx);

        } catch (error) {
            console.error('Failed to load live chapter:', error);
            setLiveError('Failed to fetch chapter content. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleNextChapter = useCallback(() => {
        if (nextChapter) {
            setNavigationDirection('next');
            const targetUrl = nextChapter.url || nextChapter.audioPath || nextChapter.id || '';

            const route = targetUrl.startsWith('http')
                ? `/read/live/${encodeURIComponent(targetUrl)}`
                : `/read/${novelId}/${nextChapter.id}`;

            navigate(route, {
                state: {
                    ...location.state,
                    chapterUrl: targetUrl.startsWith('http') ? targetUrl : '',
                    chapterTitle: nextChapter.title,
                    currentIndex: navIndex + 1,
                    chapters: navChapters
                },
                replace: true
            });
            setShowSettings(false);
        } else {
            setShowComingSoon(true);
        }
    }, [nextChapter, novelId, navigate, navChapters, navIndex, location.state]);

    const handlePrevChapter = useCallback(() => {
        if (prevChapter) {
            setNavigationDirection('prev');
            const targetUrl = prevChapter.url || prevChapter.audioPath || prevChapter.id || '';

            const route = targetUrl.startsWith('http')
                ? `/read/live/${encodeURIComponent(targetUrl)}`
                : `/read/${novelId}/${prevChapter.id}`;

            navigate(route, {
                state: {
                    ...location.state,
                    chapterUrl: targetUrl.startsWith('http') ? targetUrl : '',
                    chapterTitle: prevChapter.title,
                    currentIndex: navIndex - 1,
                    chapters: navChapters
                },
                replace: true
            });
            setShowSettings(false);
        }
    }, [prevChapter, novelId, navigate, navChapters, navIndex, location.state]);


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
            const chapterUrl = location.state?.chapterUrl || chapter.audioPath || '';
            await dbService.addChapter({
                id: `${novelDbId}-ch-${navIndex}`,
                novelId: novelDbId,
                title: chapter.title,
                content: chapter.content || '',
                orderIndex: navIndex,
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
        hasPrev: navIndex > 0 || !!prevChapter,
        hasNext: (navChapters.length > 0 && navIndex < navChapters.length - 1) || !!nextChapter,
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

    // EDGE SWIPE GESTURE HANDLERS (priority over pull navigation)
    const handleEdgeTouchStart = (e: React.TouchEvent) => {
        const touch = e.touches[0];
        if (touch.clientX <= EDGE_WIDTH) {
            edgeSwipeStartRef.current = touch.clientX;
            setIsEdgeSwiping(true);
            e.stopPropagation();
        }
    };

    const handleEdgeTouchMove = (e: React.TouchEvent) => {
        if (edgeSwipeStartRef.current === null) return;
        e.stopPropagation();
        const touch = e.touches[0];
        const diffX = touch.clientX - edgeSwipeStartRef.current;

        if (diffX > OPEN_THRESHOLD) {
            setShowChapterSidebar(true);
            edgeSwipeStartRef.current = null;
            setIsEdgeSwiping(false);
        }
    };

    const handleEdgeTouchEnd = (e: React.TouchEvent) => {
        if (edgeSwipeStartRef.current !== null) {
            e.stopPropagation();
        }
        edgeSwipeStartRef.current = null;
        setIsEdgeSwiping(false);
    };

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
                subtitle={navChapters.length > 0 ? `Chapter ${navIndex + 1}` : `Chapter ${chapter.orderIndex + 1}`}
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

            {/* Edge Swipe Gesture Layer (Invisible zone for sidebar) */}
            <div
                className="fixed left-0 top-16 bottom-0 w-12 z-40"
                style={{ touchAction: 'pan-x' }}
                onTouchStart={handleEdgeTouchStart}
                onTouchMove={handleEdgeTouchMove}
                onTouchEnd={handleEdgeTouchEnd}
            />

            {/* Main Reading Area */}
            <div
                ref={scrollContainerRef}
                className={`flex-1 overflow-y-auto px-6 py-8 ${getThemeClass()} relative touch-pan-y`}
                onTouchStart={(e) => { if (!isEdgeSwiping) onTouchStart(e); }}
                onTouchMove={(e) => { if (!isEdgeSwiping) onTouchMove(e); }}
                onTouchEnd={(e) => {
                    handleDoubleTap(e);
                    if (!isEdgeSwiping) onTouchEnd();
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
                            <div className="px-5 pb-8 space-y-5">
                                {/* TTS Controls */}
                                <div className="flex items-center justify-between gap-3">
                                    <button onClick={toggleMusic} className={clsx("flex-1 flex items-center justify-center gap-2 h-11 rounded-xl font-semibold transition-colors text-sm", isMusicPlaying ? "bg-primary/20 text-primary border border-primary/50" : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300")}>
                                        <Music size={18} />
                                        <span>{isMusicPlaying ? 'On' : 'Off'}</span>
                                    </button>
                                    <button
                                        onClick={handlePrevChapter}
                                        disabled={!prevChapter}
                                        className={clsx("flex-1 flex items-center justify-center gap-1.5 h-11 rounded-xl font-semibold transition-all bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm", !prevChapter && "opacity-30")}
                                    >
                                        <Rewind size={16} />
                                        Prev
                                    </button>
                                    <button onClick={toggleTTS} className="size-14 shrink-0 flex items-center justify-center bg-primary rounded-full shadow-lg shadow-primary/30 active:scale-95 transition-transform">
                                        {isSpeaking ? <Pause className="text-white fill-white" size={28} /> : <Play className="text-white fill-white ml-0.5" size={28} />}
                                    </button>
                                    <button
                                        onClick={handleNextChapter}
                                        disabled={!nextChapter}
                                        className={clsx("flex-1 flex items-center justify-center gap-1.5 h-11 rounded-xl font-semibold transition-all bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm", !nextChapter && "opacity-30")}
                                    >
                                        Next
                                        <FastForward size={16} />
                                    </button>
                                </div>

                                {/* Quick Actions Grid */}
                                <div className="grid grid-cols-3 gap-2.5">
                                    <button
                                        onClick={() => {
                                            setShowSettings(false);
                                            setShowChapterSidebar(true);
                                        }}
                                        className="flex flex-col items-center justify-center gap-1.5 h-16 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold transition-colors active:scale-95"
                                    >
                                        <List size={20} />
                                        <span className="text-[11px]">Contents</span>
                                    </button>
                                    <button
                                        onClick={handleShowSummary}
                                        className="flex flex-col items-center justify-center gap-1.5 h-16 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-300 font-semibold border border-indigo-200 dark:border-indigo-800 transition-colors active:scale-95"
                                    >
                                        <Sparkles size={20} />
                                        <span className="text-[11px]">Summary</span>
                                    </button>
                                    {!isLiveMode && (
                                        <button
                                            onClick={handleResyncChapter}
                                            disabled={isResyncing || !chapter?.audioPath}
                                            className={clsx(
                                                "flex flex-col items-center justify-center gap-1.5 h-16 rounded-xl font-semibold transition-colors active:scale-95",
                                                isResyncing
                                                    ? "bg-primary/20 text-primary border border-primary/50"
                                                    : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200",
                                                !chapter?.audioPath && "opacity-30"
                                            )}
                                        >
                                            <RefreshCw size={20} className={isResyncing ? "animate-spin" : ""} />
                                            <span className="text-[11px]">{isResyncing ? 'Syncing...' : 'Resync'}</span>
                                        </button>
                                    )}
                                    {isLiveMode && (
                                        <button
                                            onClick={handleSaveOffline}
                                            disabled={isSavingOffline || isChapterSaved}
                                            className={clsx(
                                                "flex flex-col items-center justify-center gap-1.5 h-16 rounded-xl font-semibold transition-colors active:scale-95",
                                                isChapterSaved
                                                    ? "bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-800"
                                                    : isSavingOffline
                                                        ? "bg-primary/20 text-primary border border-primary/50"
                                                        : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                                            )}
                                        >
                                            {isSavingOffline ? (
                                                <Loader2 size={20} className="animate-spin" />
                                            ) : (
                                                <Download size={20} />
                                            )}
                                            <span className="text-[11px]">{isChapterSaved ? 'Saved' : isSavingOffline ? 'Saving...' : 'Save'}</span>
                                        </button>
                                    )}
                                </div>

                                {/* Font & Size */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Font</p>
                                        <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
                                            <button
                                                onClick={() => settingsService.updateSettings({ fontFamily: 'serif' })}
                                                className={clsx("flex-1 py-2 text-xs font-bold rounded-md transition-colors", font === 'serif' ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm" : "text-gray-500")}
                                            >
                                                Serif
                                            </button>
                                            <button
                                                onClick={() => settingsService.updateSettings({ fontFamily: 'sans' })}
                                                className={clsx("flex-1 py-2 text-xs font-bold rounded-md transition-colors", font === 'sans' ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm" : "text-gray-500")}
                                            >
                                                Sans
                                            </button>
                                            <button
                                                onClick={() => settingsService.updateSettings({ fontFamily: 'comfortable' })}
                                                className={clsx("flex-1 py-2 text-xs font-bold rounded-md transition-colors", font === 'comfortable' ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm" : "text-gray-500")}
                                            >
                                                Soft
                                            </button>
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Size</p>
                                        <div className="flex items-center justify-between bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
                                            {fontSizes.map((size) => (
                                                <button
                                                    key={size.label}
                                                    onClick={() => settingsService.updateSettings({ fontSize: size.value })}
                                                    className={clsx("size-9 text-[10px] font-black rounded-lg transition-all", fontSize === size.value ? "bg-primary text-white shadow-md shadow-primary/30 scale-105" : "text-gray-400 hover:text-gray-600")}
                                                >
                                                    {size.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* Theme Selection */}
                                <div className="space-y-2">
                                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Theme</p>
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
                                                    "group flex flex-col items-center gap-1.5",
                                                    theme === t.id ? "scale-105" : "opacity-60 grayscale-[0.5]"
                                                )}
                                            >
                                                <div className={clsx(
                                                    "size-11 rounded-xl border-2 transition-all",
                                                    t.color,
                                                    theme === t.id ? "border-primary shadow-md shadow-primary/20" : "border-transparent"
                                                )} />
                                                <span className={clsx("text-[10px] font-bold uppercase tracking-tight transition-colors", theme === t.id ? "text-primary" : "text-gray-500")}>
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
                title="End of Novel"
                message="You have reached the end of this novel. Check back later for new chapters!"
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
                currentIndex={navIndex}
                novelTitle={novel?.title || ''}
                onSelectChapter={(ch) => {
                    if (isLiveMode) {
                        const idx = navChapters.findIndex(lc => lc.url === ch.id);
                        navigate(`/read/live/${encodeURIComponent(ch.id)}`, {
                            state: {
                                liveMode: true,
                                chapterUrl: ch.id,
                                chapterTitle: ch.title,
                                novelTitle: location.state?.novelTitle,
                                novelCoverUrl: location.state?.novelCoverUrl,
                                chapters: navChapters,
                                currentIndex: idx >= 0 ? idx : 0,
                            },
                            replace: true
                        });
                    } else {
                        const idx = navChapters.findIndex(lc => lc.id === ch.id || lc.audioPath === ch.id || lc.url === ch.id);
                        navigate(`/read/${novelId}/${ch.id}`, {
                            state: {
                                ...location.state,
                                chapters: navChapters,
                                currentIndex: idx >= 0 ? idx : ch.orderIndex,
                                liveMode: isLiveMode
                            },
                            replace: true
                        });
                    }
                }}
            />
        </div >
    );
};
