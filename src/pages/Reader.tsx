import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { dbService, type Novel, type Chapter } from '../services/db.service';
import { audioService } from '../services/audio.service';
import { settingsService } from '../services/settings.service';
import { WordHighlighter } from '../components/WordHighlighter';
import { scraperService } from '../services/scraper.service';
import { CompletionModal } from '../components/CompletionModal';
import { SummaryModal } from '../components/SummaryModal';
import { summarizerService, isValidSummary, type SummaryResult } from '../services/summarizer.service';
import { useChapterPullNavigation } from '../hooks/useChapterPullNavigation';
import { ChapterSidebar } from '../components/ChapterSidebar';
import { ReaderScroller } from '../components/ReaderScroller';
import { AudioPlayer } from '../components/AudioPlayer';
import { useAutoScroll } from '../hooks/useAutoScroll';
import { rewriterService } from '../services/rewriter.service';
import {
    ReaderHeader,
    ReaderPullDownIndicator,
    ReaderPullUpIndicator,
    ReaderNavigationHints,
    ReaderSettingsMenu,
    ReaderFloatingAutoScroll,
} from '../components/reader';
import { deriveNovelSourceUrl } from '../utils/urlUtils';

export const Reader = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { novelId, chapterId } = useParams();
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [chapter, setChapter] = useState<Chapter | null>(null);
    const [novel, setNovel] = useState<Novel | null>(null);
    const [loading, setLoading] = useState(true);
    // Chapter Sidebar State
    const [showChapterSidebar, setShowChapterSidebar] = useState(false);
    const [allChapters, setAllChapters] = useState<Chapter[]>([]);

    // Live browsing mode indicators
    const isLiveMode = Boolean(location.state?.liveMode || novelId?.startsWith('live-'));

    // Unified Navigation State (Hybrid/Live/Offline)
    const [navChapters, setNavChapters] = useState<(Chapter | any)[]>(
        location.state?.chapters ? [...location.state.chapters] : []
    );
    // Derived Navigation Index
    const navIndex = useMemo(() => {
        if (!navChapters.length) return -1;

        const idToFind = isLiveMode ? (location.state?.chapterUrl || chapterId) : chapterId;

        // Priority 1: ID match
        let idx = navChapters.findIndex(c => c.id === idToFind);

        // Priority 2: URL/AudioPath match
        if (idx === -1 && isLiveMode) {
            idx = navChapters.findIndex(c => c.url === idToFind || c.audioPath === idToFind);
        }

        // Priority 3: Stable ID partial match
        if (idx === -1 && typeof idToFind === 'string' && idToFind.includes('-ch-')) {
            const match = idToFind.match(/-ch-(\d+)$/);
            if (match) {
                const orderIdx = parseInt(match[1], 10);
                if (orderIdx >= 0 && orderIdx < navChapters.length) return orderIdx;
            }
        }

        return idx;
    }, [navChapters, chapterId, isLiveMode, location.state?.chapterUrl]);

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

    const nextChapterUrl = nextChapter?.audioPath || nextChapter?.url || null;
    const prevChapterUrl = prevChapter?.audioPath || prevChapter?.url || null;

    // Background prefetching for adjacent chapters to eliminate navigation latency
    useEffect(() => {
        if (nextChapterUrl) {
            scraperService.fetchChapterContent(nextChapterUrl).catch(() => {});
        }
        if (prevChapterUrl) {
            scraperService.fetchChapterContent(prevChapterUrl).catch(() => {});
        }
    }, [nextChapterUrl, prevChapterUrl]);


    const [liveError, setLiveError] = useState('');
    const [isSavingOffline, setIsSavingOffline] = useState(false);
    const [isChapterSaved, setIsChapterSaved] = useState(false);
    const [readChapterIds, setReadChapterIds] = useState<Set<string>>(new Set());

    // Visual indicators state (Decoupled from core gesture logic)
    const [pullDistance, setPullDistance] = useState(0);
    const [pushDistance, setPushDistance] = useState(0);
    const [navigationDirection, setNavigationDirection] = useState<'next' | 'prev' | null>(null);
    const PULL_THRESHOLD = 120;

    // Audio State
    const [isSpeaking, setIsSpeaking] = useState(false);

    // User Settings State (Global)
    const [settings, setSettings] = useState(settingsService.getSettings());
    const [showSettings, setShowSettings] = useState(false);
    const [showComingSoon, setShowComingSoon] = useState(false);
    const [isResyncing, setIsResyncing] = useState(false);

    // Summary State
    const [showSummary, setShowSummary] = useState(false);
    const [summaryData, setSummaryData] = useState<SummaryResult | null>(null);
    const [isSummarizing, setIsSummarizing] = useState(false);

    // Rewrite State
    const [isRewriting, setIsRewriting] = useState(false);
    const [rewriteProgress, setRewriteProgress] = useState('');

    // Auto-Scroll
    const {
        isAutoScrolling,
        speed: autoScrollSpeed,
        setSpeed: setAutoScrollSpeed,
        toggleAutoScroll,
        stopAutoScroll,
    } = useAutoScroll({ scrollContainerRef });

    const sidebarChapters = useMemo(() => {
        const source = (allChapters.length >= navChapters.length && allChapters.length > 0)
            ? allChapters
            : (navChapters.length > 0 ? navChapters : allChapters);

        return source.map(ch => {
            // Only mark as read if EXPLICITLY tracked — no "all before X" inference
            const isRead = readChapterIds.has(ch.id) ||
                (ch.audioPath && readChapterIds.has(ch.audioPath)) ||
                ((ch as any).url && readChapterIds.has((ch as any).url)) ||
                Boolean(ch.isRead);

            return {
                ...ch,
                isRead: isRead ? 1 : 0
            };
        });
    }, [navChapters, allChapters, readChapterIds]);


    const edgeSwipeStartRef = useRef<{ x: number; y: number } | null>(null);
    const [isEdgeSwiping, setIsEdgeSwiping] = useState(false);

    // Swipe-to-open sidebar configuration
    const SWIPE_ZONE_WIDTH = 0.5; // left half of screen
    const OPEN_THRESHOLD = 60; // px horizontal drag to open sidebar
    const MAX_VERTICAL_DRIFT = 40; // max vertical px before it's considered a scroll, not a swipe

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
        }

        // Sync with global audio state — ONLY update React state when speaking status
        // actually changes. wordBoundary events fire on every word but the isSpeaking
        // boolean stays the same, so we must guard against needless re-renders.
        let prevSpeaking: boolean | null = null;
        const audioUnsub = audioService.subscribe((state) => {
            const nowSpeaking = state.isTtsPlaying && !state.isTtsPaused;
            if (nowSpeaking !== prevSpeaking) {
                prevSpeaking = nowSpeaking;
                setIsSpeaking(nowSpeaking);
            }
            // WordHighlighter listens to wordBoundary directly now
        });

        // Sync with global app settings
        const settingsUnsub = settingsService.subscribe((newSettings) => {
            setSettings(newSettings);
        });

        return () => {
            audioUnsub();
            settingsUnsub();
        };
    }, [novelId, chapterId, location.pathname, location.state]);

    // Active reading duration session tracking
    useEffect(() => {
        if (!novelId || !chapterId) return;

        let lastFlush = Date.now();

        const flushTime = () => {
            const now = Date.now();
            const elapsedSeconds = Math.round((now - lastFlush) / 1000);
            if (elapsedSeconds >= 5) {
                dbService.recordReadingTime(novelId, chapterId, elapsedSeconds);
                lastFlush = now;
            }
        };

        const intervalId = setInterval(flushTime, 30000); // Record every 30s

        return () => {
            clearInterval(intervalId);
            flushTime();
        };
    }, [novelId, chapterId]);

    // TTS highlighting is handled inside WordHighlighter via imperative classList toggle.
    // No useEffect needed here — word boundary updates flow through wordBoundary state.

    const loadData = async (nid: string, cid: string) => {
        setLoading(true);
        try {
            const nData = await dbService.getNovel(nid);
            setNovel(nData);
            const canonicalNovelId = nData?.id || nid;

            let cData = await dbService.getChapter(canonicalNovelId, cid);
            if (!cData && canonicalNovelId !== nid) {
                cData = await dbService.getChapter(nid, cid);
            }

            // Fetch local chapters from DB for sidebar & fallback resolution
            let localChapters = await dbService.getChapters(canonicalNovelId);

            // If not found in DB, fallback to search in localChapters, navChapters, or router state
            if (!cData) {
                const searchList = localChapters.length > 0
                    ? localChapters
                    : (navChapters.length > 0 ? navChapters : (location.state?.chapters || []));

                let match = searchList.find((c: any) => c.id === cid || c.audioPath === cid || (c as any).url === cid);
                if (!match && cid.includes('-ch-')) {
                    const matchNum = cid.match(/-ch-(\d+)$/);
                    if (matchNum) {
                        const targetOrder = parseInt(matchNum[1], 10);
                        match = searchList.find((c: any) => c.orderIndex === targetOrder) || searchList[targetOrder];
                    }
                }

                if (match) {
                    const order = match.orderIndex ?? 0;
                    cData = {
                        id: match.id || cid,
                        novelId: nid,
                        title: match.title || `Chapter ${order + 1}`,
                        content: match.content || '',
                        contentPath: match.contentPath,
                        orderIndex: order,
                        audioPath: match.audioPath || (match as any).url || (cid.startsWith('http') ? cid : ''),
                        isRead: 1
                    };
                }
            }

            setChapter(cData);

            console.log(`[Reader] loadData: nid=${nid}, cid=${cid}, cData=${!!cData}, nData=${!!nData}, lastRead=${nData?.lastReadChapterId}`);

            // ALWAYS update reading progress
            // This must happen regardless of whether cData was found
            await dbService.updateReadingProgress(nid, cid, cData?.audioPath);
            console.log(`[Reader] Progress saved: novelId=${nid}, chapterId=${cid}`);
            setReadChapterIds(prev => {
                const next = new Set(prev);
                next.add(cid);
                if (cData?.audioPath) next.add(cData.audioPath);
                return next;
            });

            if (cData) {
                // AUTO-FETCH: If chapter is empty but has a source URL (stub), fetch it now
                if ((!cData.content || cData.content.length < 50) && cData.audioPath && cData.audioPath.startsWith('http')) {
                    console.log(`[Reader] Empty chapter detected, auto-fetching content from ${cData.audioPath}`);
                    try {
                        const fetchedContent = await Promise.race([
                            scraperService.fetchChapterContent(cData.audioPath),
                            new Promise<string>((_, reject) =>
                                setTimeout(() => reject(new Error('Auto-fetch timed out')), 30000)
                            )
                        ]);
                        if (fetchedContent && fetchedContent.length > 50) {
                            cData.content = fetchedContent;
                            setChapter({ ...cData }); // Update UI immediately for reading
                            dbService.saveChapterContent(nid, cData.id, fetchedContent).catch(e => console.warn('[Reader] Background save failed', e));
                        }
                    } catch (fetchErr) {
                        console.warn("[Reader] Auto-fetch failed", fetchErr);
                    }
                }

                // If localChapters had chapters, update allChapters & read IDs
                if (localChapters.length > 0) {
                    setAllChapters(localChapters);
                    const ids = new Set<string>();
                    localChapters.filter(c => c.isRead).forEach(c => {
                        ids.add(c.id);
                        if (c.audioPath) ids.add(c.audioPath);
                    });
                    setReadChapterIds(prev => {
                        const next = new Set(prev);
                        ids.forEach(id => next.add(id));
                        return next;
                    });
                } else if (navChapters.length > 0) {
                    setAllChapters(navChapters);
                }

                // Restore navigation state if missing (Continue button flow)
                if (navChapters.length === 0 && localChapters.length > 0) {
                    setNavChapters(localChapters);
                }

                // Show content immediately — mark loading as done BEFORE background sync
                setLoading(false);

                // HYBRID SYNC / Navigation Recovery: Fire-and-forget background sync (non-blocking)
                if (nData?.sourceUrl) {
                    scraperService.fetchNovelFast(nData.sourceUrl, (webChapters) => {
                        if (webChapters.length > 0) {
                            const mappedWeb = webChapters.map((ch, idx) => ({
                                id: ch.url,
                                novelId: nid,
                                title: ch.title,
                                orderIndex: idx,
                                isRead: 0
                            } as Chapter));
                            setAllChapters(mappedWeb);

                            // RULE: Update nav state if empty OR if web index is more complete
                            const webHasMore = webChapters.length > navChapters.length;
                            if (navChapters.length === 0 || webHasMore) {
                                const currentIndex = webChapters.findIndex(ch => ch.url === cData?.audioPath || ch.title === cData?.title);
                                if (currentIndex !== -1) {
                                    setNavChapters(webChapters.map((ch, idx) => ({
                                        ...ch,
                                        id: `${nid}-ch-${idx}`,
                                        novelId: nid,
                                        orderIndex: idx,
                                        audioPath: ch.url
                                    } as any)));
                                } else if (navChapters.length === 0) {
                                    setNavChapters(localChapters);
                                }
                            }
                        }
                    }, localChapters.length, undefined).catch(syncErr => {
                        console.warn("[Reader] Background sync failed", syncErr);
                        if (navChapters.length === 0 && localChapters.length > 0) {
                            setNavChapters(localChapters);
                        }
                    });
                } else if (navChapters.length === 0 && localChapters.length > 0) {
                    setNavChapters(localChapters);
                }
            } else {
                if (localChapters.length > 0) {
                    setAllChapters(localChapters);
                    if (navChapters.length === 0) {
                        setNavChapters(localChapters);
                    }
                }
                setLoading(false);
            }
        } catch (error) {
            console.error('Failed to load chapter:', error);
        } finally {
            setLoading(false);
        }
    };

    // Generate a stable novel ID from the sourceUrl (unifies with library IDs)
    const getStableNovelId = useCallback(() => {
        let sourceUrl = novel?.sourceUrl || location.state?.novel?.sourceUrl || location.state?.novelSourceUrl || '';
        if (!sourceUrl && novelId) {
            if (novelId.startsWith('http')) sourceUrl = novelId;
            else sourceUrl = deriveNovelSourceUrl(novelId);
        }
        if (!sourceUrl && chapterId && chapterId.startsWith('http')) {
            sourceUrl = deriveNovelSourceUrl(chapterId);
        }
        if (!sourceUrl && location.pathname.includes('/read/live/')) {
            const raw = location.pathname.replace('/read/live/', '');
            sourceUrl = deriveNovelSourceUrl(decodeURIComponent(raw));
        }
        return sourceUrl ? sourceUrl.replace(/\/$/, '') : 'live';
    }, [novel?.sourceUrl, location.state, novelId, chapterId, location.pathname]);

    // Live mode: fetch chapter content from web
    const loadLiveData = async () => {
        setLoading(true);
        setLiveError('');

        // 1. RECOVERY: If state is missing (cold start / refresh), try to reconstruct context
        let currentSourceUrl = location.state?.novel?.sourceUrl || location.state?.novelSourceUrl || novel?.sourceUrl || '';
        let currentLiveChapters = (location.state?.chapters || (navChapters.length > 0 ? navChapters : [])) as any[];

        let stableNovelId = novelId; // Use URL param as primary ID
        if (!stableNovelId || stableNovelId === 'null') {
            stableNovelId = getStableNovelId();
        }
        if (!currentSourceUrl && stableNovelId && stableNovelId !== 'live') {
            currentSourceUrl = stableNovelId.startsWith('http') ? stableNovelId : deriveNovelSourceUrl(stableNovelId);
        }
        if (!currentSourceUrl && chapterId && chapterId.startsWith('http')) {
            currentSourceUrl = deriveNovelSourceUrl(chapterId);
        }

        // SANITIZE: Remove any null/undefined entries that might have polluted the list
        // AND NORMALIZE: Ensure all chapters have an ID (crucial for read status)
        currentLiveChapters = currentLiveChapters.filter(c => !!c).map((c, i) => ({
            ...c,
            id: c.id || c.url, // Ensure ID exists
            novelId: stableNovelId || novelId || 'live',
            orderIndex: c.orderIndex ?? i,
            url: c.url || c.contentPath // Ensure URL exists
        }));

        let currentIdx = (location.state?.currentIndex ?? (navIndex !== -1 ? navIndex : -1)) as number;

        // Re-map novelId now that we have stableNovelId (if it was missing)
        if (stableNovelId) {
            currentLiveChapters.forEach(c => c.novelId = stableNovelId!);
        }

        try {
            await dbService.initialize();

            // Sync Read Status
            if (stableNovelId && stableNovelId !== 'live') {
                const dbChapters = await dbService.getChapters(stableNovelId);
                const ids = new Set<string>();
                dbChapters.filter(c => c.isRead).forEach(c => {
                    ids.add(c.id);
                    if (c.audioPath) ids.add(c.audioPath);
                });
                setReadChapterIds(ids);

                // If currentLiveChapters is empty (cold start / app reload), try restoring from DB
                if (currentLiveChapters.length === 0 && dbChapters.length > 0) {
                    currentLiveChapters = dbChapters.map((c, i) => ({
                        title: c.title,
                        url: c.audioPath || c.id,
                        id: c.id,
                        novelId: stableNovelId!,
                        orderIndex: c.orderIndex ?? i,
                        date: c.date
                    }));
                    console.log("[Reader] Cold start: restored chapters from DB:", currentLiveChapters.length);
                    setNavChapters(currentLiveChapters);
                }
            }

            // Attempt to restore Novel info from DB if missing
            if (!currentSourceUrl && stableNovelId && stableNovelId !== 'live') {
                const dbNovel = await dbService.getNovel(stableNovelId);
                if (dbNovel && dbNovel.sourceUrl) {
                    currentSourceUrl = dbNovel.sourceUrl;
                    console.log("[Reader] Recovered sourceUrl from DB:", currentSourceUrl);
                }
            }

            // Navigation Re-construction Fallback (Recovery Rule for live mode)
            if (currentLiveChapters.length === 0 && currentSourceUrl) {
                console.log("[Reader] Missing navChapters in state, fetching live index from:", currentSourceUrl);
                try {
                    const novelData = await scraperService.fetchNovelFast(currentSourceUrl);
                    if (novelData && novelData.chapters) {
                        currentLiveChapters = novelData.chapters.map((c, i) => ({
                            ...c,
                            id: c.url,
                            novelId: stableNovelId!,
                            orderIndex: i
                        } as any));
                        if (currentLiveChapters.length > 0) {
                            setNavChapters(currentLiveChapters);
                        }
                    }
                } catch (e) {
                    console.warn("[Reader] Failed to reconstruct live navigation", e);
                }
            }

            // Restore Current Index if missing (Recovery Rule: findIndex ONLY)
            const rawLiveUrl = location.pathname.startsWith('/read/live/') ? decodeURIComponent(location.pathname.replace('/read/live/', '')) : '';
            const lookupUrl = location.state?.chapterUrl || rawLiveUrl || chapterId || '';

            if (currentIdx === -1 && currentLiveChapters.length > 0) {
                currentIdx = currentLiveChapters.findIndex(c =>
                    c.url === lookupUrl ||
                    c.id === lookupUrl ||
                    c.audioPath === lookupUrl ||
                    (lookupUrl && c.url && (c.url.endsWith(lookupUrl) || lookupUrl.endsWith(c.url)))
                );

                // Fallback to ID-based index parsing as a LAST resort if URL lookup fails
                if (currentIdx === -1 && lookupUrl) {
                    const match = lookupUrl.match(/-ch-(\d+)$/) || lookupUrl.match(/chapter-(\d+)/i) || lookupUrl.match(/ch-(\d+)/i);
                    if (match) {
                        const parsedIdx = parseInt(match[1], 10);
                        if (parsedIdx >= 0 && parsedIdx < currentLiveChapters.length) {
                            currentIdx = parsedIdx;
                        }
                    }
                }
            }

            // --- END RECOVERY ---

            // Determine Chapter URL (for fetching content)
            const targetChapter = (currentIdx !== -1 && currentLiveChapters[currentIdx]) ? currentLiveChapters[currentIdx] : null;
            const chapterUrl = location.state?.chapterUrl ||
                (targetChapter as any)?.url ||
                (targetChapter as any)?.audioPath ||
                rawLiveUrl ||
                (chapterId?.startsWith('http') ? chapterId : '');

            // Fallback Title
            const chapterTitle = location.state?.chapterTitle || (targetChapter as any)?.title || (currentIdx >= 0 ? `Chapter ${currentIdx + 1}` : 'Chapter');

            const chapterStableId = `${stableNovelId}-ch-${currentIdx !== -1 ? currentIdx : 0}`;

            // 1. Check if chapter already exists in DB (persistent download verification)
            const existingChapter = await dbService.getChapter(stableNovelId!, chapterStableId);
            let content = '';

            if (existingChapter && existingChapter.content) {
                content = existingChapter.content;
                setIsChapterSaved(true);
                console.log(`[Reader] Using persistent content for ${chapterStableId}`);
            } else if (chapterUrl) {
                // 2. Fetch live content with timeout protection
                setIsChapterSaved(false);
                const fetchWithTimeout = (url: string, timeoutMs: number) =>
                    Promise.race([
                        scraperService.fetchChapterContent(url),
                        new Promise<string>((_, reject) =>
                            setTimeout(() => reject(new Error('Chapter fetch timed out')), timeoutMs)
                        )
                    ]);
                try {
                    content = await fetchWithTimeout(chapterUrl, 30000);
                } catch (fetchErr) {
                    console.warn('[Reader] First fetch attempt failed, retrying...', fetchErr);
                    try {
                        content = await fetchWithTimeout(chapterUrl, 30000);
                    } catch {
                        content = '<p>Chapter content could not be loaded. Please try again or check your connection.</p>';
                    }
                }
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
                const dbChapters = await dbService.getChapters(stableNovelId!);
                const readStatusMap = new Set(dbChapters.filter(c => c.isRead).map(c => c.id));

                setAllChapters(currentLiveChapters.map((ch, idx) => {
                    if (!ch) return null; // Safe guard
                    // Hybrid ID matching: try both URL and stable ID format
                    const stableId = `${stableNovelId}-ch-${idx}`;
                    const chUrl = (ch as any).url || (ch as any).audioPath || '';
                    const isRead = readStatusMap.has(stableId) || (chUrl && readStatusMap.has(chUrl)) || Boolean(ch.isRead);

                    return {
                        id: chUrl || stableId,
                        novelId: stableNovelId,
                        title: ch.title || `Chapter ${idx + 1}`,
                        orderIndex: idx,
                        audioPath: chUrl,
                        url: chUrl,
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

            // 3. Mark as read / update history
            const novelInDB = await dbService.getNovel(stableNovelId!);
            if (novelInDB) {
                // Ensure the chapter record exists in DB (stub without full content if not downloaded)
                const existingCh = await dbService.getChapter(stableNovelId!, chapterStableId);
                if (!existingCh) {
                    await dbService.addChapter({
                        id: chapterStableId,
                        novelId: stableNovelId!,
                        title: chapterTitle,
                        content: '', // No content stored (not downloaded)
                        orderIndex: currentIdx,
                        audioPath: chapterUrl,
                    } as any);
                }
            }
            
            await dbService.updateReadingProgress(stableNovelId!, chapterStableId, chapterUrl);
            setReadChapterIds(prev => {
                const next = new Set(prev);
                next.add(chapterStableId);
                if (chapterUrl) next.add(chapterUrl);
                return next;
            });
            console.log(`[Reader] Progress updated: ${stableNovelId}`);

            // Sync back to unified state
            setNavChapters(currentLiveChapters);


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
            const targetUrl = nextChapter.audioPath || nextChapter.url || '';
            const targetId = nextChapter.id || `${novelId}-ch-${navIndex + 1}`;

            const route = isLiveMode
                ? `/read/live/${encodeURIComponent(targetUrl || targetId)}`
                : `/read/${encodeURIComponent(novelId || '')}/${encodeURIComponent(targetId)}`;

            navigate(route, {
                state: {
                    ...location.state,
                    liveMode: isLiveMode,
                    chapterUrl: targetUrl,
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
    }, [nextChapter, novelId, navigate, navChapters, navIndex, isLiveMode, location.state]);

    const handlePrevChapter = useCallback(() => {
        if (prevChapter) {
            setNavigationDirection('prev');
            const targetUrl = prevChapter.audioPath || prevChapter.url || '';
            const targetId = prevChapter.id || `${novelId}-ch-${navIndex - 1}`;

            const route = isLiveMode
                ? `/read/live/${encodeURIComponent(targetUrl || targetId)}`
                : `/read/${encodeURIComponent(novelId || '')}/${encodeURIComponent(targetId)}`;

            navigate(route, {
                state: {
                    ...location.state,
                    liveMode: isLiveMode,
                    chapterUrl: targetUrl,
                    chapterTitle: prevChapter.title,
                    currentIndex: navIndex - 1,
                    chapters: navChapters
                },
                replace: true
            });
            setShowSettings(false);
        }
    }, [prevChapter, novelId, navigate, navChapters, navIndex, isLiveMode, location.state]);


    // Save current live chapter to DB for offline reading
    const handleSaveOffline = async () => {
        if (!isLiveMode || !chapter || isSavingOffline || isChapterSaved) return;
        setIsSavingOffline(true);
        try {
            const novelSourceUrl = novel?.sourceUrl || location.state?.novel?.sourceUrl || '';
            // Use sourceUrl directly as the ID — matches ChapterList's route param
            const novelDbId = novelSourceUrl || getStableNovelId();

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
                source: novelSourceUrl?.includes('freewebnovel') ? 'FreeWebNovel' : 'NovelFire',
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
    const { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel } = useChapterPullNavigation({
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
        const fromPath = location.state?.from || '/';
        const targetPath = (novel?.category === 'Manhwa' ? `/manhwa/${encodeURIComponent(novelId || '')}` : `/novel/${encodeURIComponent(novelId || '')}`);
        navigate(targetPath, {
            state: {
                novel,
                liveMode: isLiveMode,
                from: fromPath
            },
            replace: true
        });
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


    const handleStartAudio = () => {
        if (chapter?.content) {
            audioService.speak(chapter.content, chapter.title, novel?.title || 'Unknown Novel', novel?.coverUrl);
            setShowSettings(false);
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

    const handleRewrite = async () => {
        if (!chapter || !chapter.content) return;

        // Check for API Key
        if (!settings.summarizerApiKey && !settings.groqApiKey && !settings.openRouterApiKey && !settings.mistralApiKey) {
            setRewriteProgress('API Key Req.');
            setTimeout(() => setRewriteProgress(''), 3000);
            return;
        }

        setIsRewriting(true);
        setRewriteProgress('Starting...');

        try {
            const newContent = await rewriterService.rewriteChapter(
                chapter.content,
                settings.summarizerApiKey || '',
                settings.groqApiKey,
                settings.mistralApiKey,
                settings.openRouterApiKey,
                (current: number, total: number) => setRewriteProgress(`${current}/${total}`)
            );

            if (newContent && newContent !== chapter.content) {
                // Apply smart formatting (thoughts, sfx, system msgs) just like normal chapters
                const processedContent = scraperService.enhanceContent(newContent);

                if (!isLiveMode) {
                    // Update DB mapped content
                    await dbService.updateChapterContent(chapter.novelId, chapter.id, processedContent);
                }
                // Update local state
                setChapter(prev => prev ? { ...prev, content: processedContent } : null);
                setRewriteProgress('Done!');
                setTimeout(() => setRewriteProgress(''), 3000);
            } else {
                setRewriteProgress('No changes');
                setTimeout(() => setRewriteProgress(''), 2000);
            }
        } catch (error: any) {
            console.error('Rewrite failed:', error);
            setRewriteProgress('Failed');
            setTimeout(() => setRewriteProgress(''), 3000);
        } finally {
            setIsRewriting(false);
            if (rewriteProgress === 'Starting...' || rewriteProgress.includes('/')) {
                setRewriteProgress('');
            }
        }
    };

    const handleShowSummary = async (forceReload: boolean = false) => {
        if (!chapter || !chapter.content) return;

        setShowSettings(false);
        setShowSummary(true);

        // Check if we already have it in memory or DB (unless forcing reload)
        if (!forceReload && summaryData && summaryData.extractive) return;

        setIsSummarizing(true);
        if (forceReload) {
            // Also explicitly clear the state so the user sees it loading
            setSummaryData(null);
        }

        try {
            // 1. Check DB for cached summary
            let cachedExtractive = null;
            let cachedEventsStr = null;

            if (!forceReload) {
                cachedExtractive = await dbService.getSummary(chapter.id, 'extractive');
                cachedEventsStr = await dbService.getSummary(chapter.id, 'events');
                const cachedProvider = await dbService.getSummary(chapter.id, 'providerUsed');
                if (cachedExtractive && cachedEventsStr) {
                    setSummaryData({
                        extractive: cachedExtractive,
                        events: JSON.parse(cachedEventsStr),
                        providerUsed: cachedProvider || undefined
                    });
                }
            }

            if (!cachedExtractive || !cachedEventsStr) {
                // Check for API Key
                if (!settings.summarizerApiKey && !settings.groqApiKey && !settings.openRouterApiKey && !settings.mistralApiKey) {
                    setSummaryData({
                        extractive: "AI Summarization requires a free API Key (Groq recommended).",
                        events: [
                            "Open the app Settings",
                            "Scroll down to Advanced",
                            "Get a free API key from Groq (recommended), OpenRouter, or Google AI Studio."
                        ]
                    });
                    setIsSummarizing(false);
                    return;
                }

                // 2. Generate if not found (strip HTML for processing)
                const div = document.createElement('div');
                div.innerHTML = chapter.content;
                const textContent = div.textContent || div.innerText || '';

                const result = await summarizerService.generateSummary(
                    chapter.title,
                    textContent,
                    settings.summarizerApiKey || '',
                    settings.groqApiKey,
                    settings.mistralApiKey,
                    settings.openRouterApiKey,
                    settings.providerPriority
                );
                setSummaryData(result);

                // 3. Save to DB only if result passes the same error-pattern
                //    detection the summarizer uses internally. This prevents
                //    garbage from a silently-broken model from being cached.
                if (isValidSummary(result, textContent.length)) {
                    await dbService.saveSummary(chapter.id, 'extractive', result.extractive);
                    await dbService.saveSummary(chapter.id, 'events', JSON.stringify(result.events));
                    if (result.providerUsed) {
                        await dbService.saveSummary(chapter.id, 'providerUsed', result.providerUsed);
                    }
                } else {
                    console.warn('[Reader] Summary failed validation — not caching to DB:', result.extractive.substring(0, 100));
                }
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

        // If vertical movement exceeds threshold, it's a scroll not a swipe
        if (diffY > MAX_VERTICAL_DRIFT) {
            edgeSwipeStartRef.current = null;
            setIsEdgeSwiping(false);
            return;
        }

        // Detect intentional horizontal right-swipe
        if (diffX > OPEN_THRESHOLD && diffX > diffY * 1.5) {
            setShowChapterSidebar(true);
            edgeSwipeStartRef.current = null;
            setIsEdgeSwiping(false);
        } else if (diffX > 15) {
            // Starting to look like a horizontal swipe, flag it
            setIsEdgeSwiping(true);
        }
    };

    const handleEdgeTouchEnd = () => {
        edgeSwipeStartRef.current = null;
        setIsEdgeSwiping(false);
    };

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
            {/* Top App Bar using ReaderHeader */}
            <ReaderHeader
                chapter={chapter}
                navIndex={navIndex}
                hasNavChapters={navChapters.length > 0}
                onBack={handleBackToIndex}
                onToggleSettings={() => setShowSettings(!showSettings)}
            />

            {/* Fast Scroller Custom Handle */}
            <ReaderScroller 
                containerRef={scrollContainerRef} 
                isVisible={!showSettings && !showChapterSidebar && !showSummary} 
                onDragStart={() => {
                    if (isAutoScrolling) stopAutoScroll();
                }}
            />

            {/* Edge swipe gesture is now handled on the main reading area below */}

            {/* Main Reading Area */}
            <div
                ref={scrollContainerRef}
                className={`flex-1 overflow-y-auto px-6 py-8 ${getThemeClass()} relative touch-pan-y`}
                onTouchStart={(e) => { handleEdgeTouchStart(e); if (!isEdgeSwiping) onTouchStart(e); }}
                onTouchMove={(e) => { handleEdgeTouchMove(e); if (!isEdgeSwiping) onTouchMove(e); }}
                onTouchEnd={(e) => {
                    handleDoubleTap(e);
                    const wasEdgeSwiping = isEdgeSwiping;
                    handleEdgeTouchEnd();
                    if (wasEdgeSwiping) {
                        onTouchCancel();
                    } else {
                        onTouchEnd();
                    }
                }}
                onClick={handleDoubleTap}
            >
                {/* 
                    NOTE: a near-bottom scroll detector previously lived here but had 
                    no actual effect (empty branch) while still forcing a synchronous 
                    layout read — scrollHeight/scrollTop/clientHeight — on every single 
                    scroll event, unthrottled. This ran continuously during TTS 
                    auto-scroll sessions, adding sustained CPU cost across the whole 
                    reading session. Removed since it did nothing; if a "near end of 
                    chapter" indicator is wanted later, implement it with a throttled 
                    IntersectionObserver on a sentinel element near the bottom of the 
                    content instead of a per-scroll-event layout read.
                */}
                <div
                    className="relative w-full"
                    style={{
                        transform: `translateY(calc(${pullDistance}px - ${pushDistance}px))`,
                        transition: (pushDistance === 0 && pullDistance === 0) ? 'transform 0.3s ease-out' : 'none'
                    }}
                >
                    {/* Pull to Previous Indicator */}
                    <ReaderPullDownIndicator
                        pullDistance={pullDistance}
                        threshold={PULL_THRESHOLD}
                        hasPrev={!!prevChapter}
                    />

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
                            <WordHighlighter
                                id="reader-content-container"
                                htmlContent={chapter.content || ''}
                            />

                            {/* End of Chapter / End of Novel Hints */}
                            <ReaderNavigationHints
                                nextChapter={nextChapter}
                                onNextChapter={handleNextChapter}
                            />
                        </motion.div>
                    </AnimatePresence>

                    {/* Pull Up to Next Indicator */}
                    <ReaderPullUpIndicator
                        pushDistance={pushDistance}
                        threshold={PULL_THRESHOLD}
                        hasNext={!!nextChapter}
                    />
                </div>

                {/* Extra Padding Removed */}
            </div>



            {/* Customization Overlay */}
            <ReaderSettingsMenu
                isOpen={showSettings}
                onClose={() => setShowSettings(false)}
                chapter={chapter}
                prevChapter={prevChapter}
                nextChapter={nextChapter}
                isSpeaking={isSpeaking}
                isLiveMode={isLiveMode}
                isResyncing={isResyncing}
                isSavingOffline={isSavingOffline}
                isChapterSaved={isChapterSaved}
                isRewriting={isRewriting}
                rewriteProgress={rewriteProgress}
                isAutoScrolling={isAutoScrolling}
                autoScrollSpeed={autoScrollSpeed}
                settings={settings}
                onPrevChapter={handlePrevChapter}
                onNextChapter={handleNextChapter}
                onToggleAudio={() => {
                    if (isSpeaking) {
                        audioService.stopSpeaking(true);
                    } else {
                        handleStartAudio();
                    }
                }}
                onOpenSidebar={() => setShowChapterSidebar(true)}
                onShowSummary={() => handleShowSummary()}
                onRewrite={handleRewrite}
                onResyncChapter={handleResyncChapter}
                onSaveOffline={handleSaveOffline}
                onToggleAutoScroll={toggleAutoScroll}
                onChangeAutoScrollSpeed={setAutoScrollSpeed}
                onUpdateSettings={(newSettings) => settingsService.updateSettings(newSettings)}
            />

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
                onReload={() => {
                    setSummaryData(null);
                    handleShowSummary(true);
                }}
            />

            <AudioPlayer
                chapter={chapter}
                novel={novel}
                onPrevChapter={handlePrevChapter}
                onNextChapter={handleNextChapter}
                hasPrev={!!prevChapter}
                hasNext={!!nextChapter}
            />

            {/* Chapter Sidebar */}
            <ChapterSidebar
                isOpen={showChapterSidebar}
                onClose={() => setShowChapterSidebar(false)}
                chapters={sidebarChapters}
                currentChapterId={isLiveMode ? (location.state?.chapterUrl || '') : (chapterId || '')}
                currentIndex={navIndex >= 0 ? navIndex : undefined}
                novelTitle={novel?.title || ''}
                onSelectChapter={(selectedChapter, index) => {
                    const fullList = (allChapters.length >= navChapters.length && allChapters.length > 0)
                        ? allChapters
                        : (navChapters.length > 0 ? navChapters : allChapters);

                    const target = selectedChapter || fullList[index] || navChapters[index] || allChapters[index];
                    if (!target) {
                        console.warn("[Reader] Target chapter not found for index:", index);
                        return;
                    }

                    const correctIndex = (target.orderIndex !== undefined && target.orderIndex >= 0)
                        ? target.orderIndex
                        : (index >= 0 ? index : fullList.findIndex((c: any) => c.id === target.id || (c.url && c.url === (target as any).url)));

                    const targetUrl =
                        (target as any).url ||
                        target.audioPath ||
                        (target.id?.startsWith('http') ? target.id : '');

                    const targetId = (!target.id || target.id.startsWith('http'))
                        ? `${novelId || target.novelId || 'novel'}-ch-${correctIndex >= 0 ? correctIndex : 0}`
                        : target.id;

                    if (isLiveMode) {
                        const liveUrl = targetUrl || targetId;
                        navigate(`/read/live/${encodeURIComponent(liveUrl)}`, {
                            state: {
                                liveMode: true,
                                chapterUrl: liveUrl,
                                chapterTitle: target.title,
                                novelTitle: novel?.title || location.state?.novelTitle,
                                novelCoverUrl: novel?.coverUrl || location.state?.novelCoverUrl,
                                novelSourceUrl: novel?.sourceUrl || location.state?.novelSourceUrl,
                                chapters: [...fullList],
                                currentIndex: correctIndex >= 0 ? correctIndex : index,
                            },
                            replace: true
                        });
                    } else {
                        const currentNid = novelId || target.novelId || '';
                        navigate(`/read/${encodeURIComponent(currentNid)}/${encodeURIComponent(targetId)}`, {
                            state: {
                                ...location.state,
                                novel: novel || location.state?.novel,
                                chapterUrl: targetUrl,
                                chapterTitle: target.title,
                                chapters: [...fullList],
                                currentIndex: correctIndex >= 0 ? correctIndex : index,
                                liveMode: false
                            },
                            replace: true
                        });
                    }
                }}
            />

            {/* Auto-Scroll Floating Mini-Controller */}
            <ReaderFloatingAutoScroll
                isVisible={isAutoScrolling && !showSettings}
                autoScrollSpeed={autoScrollSpeed}
                onDecreaseSpeed={() => setAutoScrollSpeed(Math.max(1, autoScrollSpeed - 1))}
                onIncreaseSpeed={() => setAutoScrollSpeed(Math.min(10, autoScrollSpeed + 1))}
                onStopAutoScroll={stopAutoScroll}
            />
        </div >
    );
};
