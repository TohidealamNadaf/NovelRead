import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { chapterListCache } from './chapterListCache';


export interface Novel {
    id: string;
    title: string;
    author?: string;
    coverUrl?: string;
    sourceUrl: string;
    summary?: string;
    category?: string;
    status?: string;
    source?: string;
    lastReadChapterId?: string;
    lastReadAt?: number;
    createdAt?: number;
    totalChapters?: number;
    readChapters?: number;
    lastFetchedAt?: number; // Timestamp of last successful chapter fetch
    collectionIds?: string[]; // IDs of collections this novel belongs to
}

export interface Collection {
    id: string;
    name: string;
    color?: string;
    icon?: string;
    createdAt?: number;
    novelCount?: number;
}

export interface ReadingSession {
    id: string;
    novelId: string;
    chapterId?: string;
    durationSeconds: number;
    sessionDate: string; // YYYY-MM-DD
    createdAt?: number;
}

export interface ReadingStatistics {
    chaptersRead: number;
    novelsCount: number;
    totalReadingTimeMinutes: number;
    currentStreakDays: number;
    last7Days: { date: string; dayName: string; minutes: number }[];
}

export interface Chapter {
    id: string;
    novelId: string;
    title: string;
    content?: string;
    contentPath?: string; // Path to file on disk
    orderIndex: number;
    audioPath?: string;
    isRead?: number;
    date?: string;
}

class DatabaseService {
    private sqlite: SQLiteConnection;
    private db: SQLiteDBConnection | null = null;
    private initializationPromise: Promise<void> | null = null;

    constructor() {
        this.sqlite = new SQLiteConnection(CapacitorSQLite);
    }

    async initialize() {
        if (this.db) return;

        // Prevent concurrent initialization attempts
        if (this.initializationPromise) {
            return this.initializationPromise;
        }

        this.initializationPromise = this._doInitialize();
        try {
            await this.initializationPromise;
        } finally {
            // Only clear the promise if init failed (db is still null)
            // so next caller can retry
            if (!this.db) {
                this.initializationPromise = null;
            }
        }
    }

    private async _doInitialize() {
        if (this.db) return;

        try {
            if (Capacitor.getPlatform() === 'web') {
                // Web store should already be initialized in main.tsx
                // But as a safety fallback, try to init if needed
                try {
                    await this.sqlite.initWebStore();
                } catch (e) {
                    // Already initialized — this is expected, ignore
                    console.log('[DB] WebStore already initialized or init skipped');
                }
            }

            this.db = await this.sqlite.createConnection('novel_db', false, 'no-encryption', 1, false);
            await this.db.open();

            // Enable foreign keys
            await this.db.execute('PRAGMA foreign_keys = ON;');

            const schema = `
                CREATE TABLE IF NOT EXISTS novels (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    author TEXT,
                    coverUrl TEXT,
                    sourceUrl TEXT NOT NULL,
                    summary TEXT,
                    category TEXT,
                    status TEXT,
                    lastReadChapterId TEXT,
                    lastReadAt INTEGER,
                    totalChapters INTEGER DEFAULT 0,
                    readChapters INTEGER DEFAULT 0,
                    lastFetchedAt INTEGER,
                    createdAt INTEGER DEFAULT (strftime('%s', 'now'))
                );
                CREATE INDEX IF NOT EXISTS idx_novels_lastReadAt ON novels(lastReadAt DESC);

                CREATE TABLE IF NOT EXISTS chapters (
                    id TEXT PRIMARY KEY,
                    novelId TEXT NOT NULL,
                    title TEXT NOT NULL,
                    content TEXT, -- Deprecated, use contentPath + Filesystem
                    contentPath TEXT,
                    orderIndex INTEGER NOT NULL,
                    audioPath TEXT,
                    isRead INTEGER DEFAULT 0,
                    date TEXT,
                    FOREIGN KEY(novelId) REFERENCES novels(id) ON DELETE CASCADE
                );
                CREATE INDEX IF NOT EXISTS idx_chapters_novel_order ON chapters(novelId, orderIndex);
                CREATE INDEX IF NOT EXISTS idx_chapters_isRead ON chapters(isRead);
            `;

            await this.db.execute(schema);

            // Migration: Ensure new column 'chapter_summaries' table exists
            const summaryTableSchema = `
                CREATE TABLE IF NOT EXISTS chapter_summaries (
                    chapterId TEXT NOT NULL,
                    summaryType TEXT NOT NULL,
                    summaryText TEXT NOT NULL,
                    createdAt INTEGER DEFAULT (strftime('%s', 'now')),
                    PRIMARY KEY (chapterId, summaryType),
                    FOREIGN KEY(chapterId) REFERENCES chapters(id) ON DELETE CASCADE
                );
            `;
            await this.db.execute(summaryTableSchema);

            // Migration: Ensure discovery_cache table exists
            const cacheTableSchema = `
                CREATE TABLE IF NOT EXISTS discovery_cache (
                    key TEXT PRIMARY KEY,
                    data TEXT NOT NULL,
                    timestamp INTEGER DEFAULT (strftime('%s', 'now'))
                );
            `;
            await this.db.execute(cacheTableSchema);

            // Migration: Ensure collections and reading_sessions tables exist
            const libraryTablesSchema = `
                CREATE TABLE IF NOT EXISTS collections (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    color TEXT DEFAULT '#6366f1',
                    icon TEXT DEFAULT 'bookmark',
                    createdAt INTEGER DEFAULT (strftime('%s', 'now'))
                );

                CREATE TABLE IF NOT EXISTS novel_collections (
                    novelId TEXT NOT NULL,
                    collectionId TEXT NOT NULL,
                    addedAt INTEGER DEFAULT (strftime('%s', 'now')),
                    PRIMARY KEY (novelId, collectionId),
                    FOREIGN KEY(novelId) REFERENCES novels(id) ON DELETE CASCADE,
                    FOREIGN KEY(collectionId) REFERENCES collections(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS reading_sessions (
                    id TEXT PRIMARY KEY,
                    novelId TEXT NOT NULL,
                    chapterId TEXT,
                    durationSeconds INTEGER NOT NULL,
                    sessionDate TEXT NOT NULL,
                    createdAt INTEGER DEFAULT (strftime('%s', 'now'))
                );
                CREATE INDEX IF NOT EXISTS idx_reading_sessions_date ON reading_sessions(sessionDate);
            `;
            await this.db.execute(libraryTablesSchema);

            // Seed default collections if table is empty
            try {
                const countRes = await this.db.query('SELECT COUNT(*) as c FROM collections');
                if (countRes.values && countRes.values[0]?.c === 0) {
                    const defaultCols = [
                        ['col-reading', 'Reading', '#3b82f6', 'book-open'],
                        ['col-plan-to-read', 'Plan to Read', '#f59e0b', 'clock'],
                        ['col-favorites', 'Favorites', '#ec4899', 'heart'],
                        ['col-completed', 'Completed', '#10b981', 'check-circle'],
                    ];
                    for (const [id, name, color, icon] of defaultCols) {
                        await this.db.run('INSERT INTO collections (id, name, color, icon) VALUES (?, ?, ?, ?)', [id, name, color, icon]);
                    }
                }
            } catch (seedErr) {
                console.warn('[DB] Seeding collections skipped or failed', seedErr);
            }

            // Migration: Ensure new columns exist
            const columnsToAdd = [
                { name: 'summary', type: 'TEXT' },
                { name: 'category', type: 'TEXT' },
                { name: 'status', type: 'TEXT' },
                { name: 'lastReadAt', type: 'INTEGER' },
                { name: 'totalChapters', type: 'INTEGER DEFAULT 0' },
                { name: 'readChapters', type: 'INTEGER DEFAULT 0' },
                { name: 'lastFetchedAt', type: 'INTEGER' }
            ];

            const chapterColumnsToAdd = [
                { name: 'date', type: 'TEXT' },
                { name: 'contentPath', type: 'TEXT' }
            ];

            for (const col of columnsToAdd) {
                try {
                    // Check if column exists
                    const tableInfo = await this.db.query(`PRAGMA table_info(novels)`);
                    const exists = tableInfo.values?.some((c: { name: string }) => c.name === col.name);

                    if (!exists) {
                        console.log(`Migration: Adding column ${col.name} to novels table`);
                        await this.db.execute(`ALTER TABLE novels ADD COLUMN ${col.name} ${col.type}`);
                    }
                } catch (e) {
                    console.error(`Failed to migrate column ${col.name}`, e);
                }
            }

            for (const col of chapterColumnsToAdd) {
                try {
                    // Check if column exists
                    const tableInfo = await this.db.query(`PRAGMA table_info(chapters)`);
                    const exists = tableInfo.values?.some((c: { name: string }) => c.name === col.name);

                    if (!exists) {
                        console.log(`Migration: Adding column ${col.name} to chapters table`);
                        await this.db.execute(`ALTER TABLE chapters ADD COLUMN ${col.name} ${col.type}`);
                    }
                } catch (e) {
                    console.error(`Failed to migrate column ${col.name}`, e);
                }
            }

            // ---------------------------------------------------------
            // MIGRATION: Move CONTENT from DB to FILESYSTEM
            // ---------------------------------------------------------
            try {
                // Find up to 50 chapters with content but no contentPath
                const result = await this.db.query('SELECT * FROM chapters WHERE content IS NOT NULL AND content != "" AND (contentPath IS NULL OR contentPath = "") LIMIT 50');
                if (result.values && result.values.length > 0) {
                    console.log(`[DB] Migrating ${result.values.length} chapters to Filesystem...`);
                    for (const ch of result.values as Chapter[]) {
                        try {
                            // Save to FS
                            const path = await this.saveChapterContent(ch.novelId, ch.id, ch.content!);
                            // Update DB
                            await this.db.run('UPDATE chapters SET contentPath = ?, content = NULL WHERE id = ?', [path, ch.id]);
                        } catch (err) {
                            console.error(`[DB] Failed to migrate chapter ${ch.id}`, err);
                        }
                    }
                    console.log(`[DB] Migration batch complete.`);
                }
            } catch (e) {
                console.error("[DB] Migration check failed", e);
            }

        } catch (error) {
            console.error("Database initialization failed", error);
        }
    }

    // --- Filesystem Helpers ---
    private sanitizePathSegment(str: string): string {
        if (!str) return 'unknown';
        return str
            .replace(/^https?:\/\//i, '')
            .replace(/[^a-zA-Z0-9_-]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '')
            .slice(0, 150);
    }

    private async getNovelDir(novelId: string): Promise<string> {
        const safeDir = this.sanitizePathSegment(novelId);
        return `NOVEL_DATA/${safeDir}`;
    }

    async saveChapterContent(novelId: string, chapterId: string, content: string): Promise<string> {
        try {
            const dir = await this.getNovelDir(novelId);
            // Ensure directory exists (silently fail if already exists)
            try {
                await Filesystem.mkdir({
                    path: dir,
                    directory: Directory.Data,
                    recursive: true
                });
            } catch (e: any) {
                // Ignore "Current directory does already exist" error on Web/Android
                if (!e.message?.includes('already exist')) {
                    console.warn('[FS] mkdir error (ignored if exists):', e);
                }
            }

            const safeFileName = `${this.sanitizePathSegment(chapterId)}.txt`;
            const filePath = `${dir}/${safeFileName}`;

            await Filesystem.writeFile({
                path: filePath,
                data: content,
                directory: Directory.Data,
                encoding: Encoding.UTF8
            });

            return filePath;
        } catch (e) {
            console.error(`[FS] Failed to save chapter content: ${e}`);
            throw e;
        }
    }

    async readChapterContent(contentPath: string): Promise<string | null> {
        try {
            const result = await Filesystem.readFile({
                path: contentPath,
                directory: Directory.Data,
                encoding: Encoding.UTF8
            });
            return result.data as string;
        } catch (e) {
            console.error(`[FS] Failed to read chapter content at ${contentPath}: ${e}`);
            return null;
        }
    }

    async deleteChapterContent(contentPath: string) {
        if (!contentPath) return;
        try {
            await Filesystem.deleteFile({
                path: contentPath,
                directory: Directory.Data
            });
        } catch (e) {
            // Ignore if file not found
        }
    }

    async getDB() {
        if (this.db) {
            try {
                const isConfigured = await this.db.isDBOpen();
                if (!isConfigured.result) {
                    await this.db.open();
                }
            } catch (e) {
                console.error("[DB] Failed to verify/reopen DB, re-initializing", e);
                this.db = null;
            }
        }
        if (!this.db) await this.initialize();
        return this.db;
    }

    async save() {
        if (Capacitor.getPlatform() === 'web') {
            await this.sqlite.saveToStore('novel_db');
        }
    }

    // --- Cache Methods ---
    async getCache(key: string): Promise<any | null> {
        const db = await this.getDB();
        if (!db) return null;
        try {
            const result = await db.query('SELECT data FROM discovery_cache WHERE key = ?', [key]);
            if (result.values && result.values.length > 0) {
                return JSON.parse(result.values[0].data);
            }
            return null;
        } catch (e) {
            console.error(`Failed to get cache for ${key}`, e);
            return null;
        }
    }

    async setCache(key: string, data: any) {
        const db = await this.getDB();
        if (!db) return;
        try {
            const json = JSON.stringify(data);
            await db.run(
                'INSERT OR REPLACE INTO discovery_cache (key, data, timestamp) VALUES (?, ?, strftime(\'%s\', \'now\'))',
                [key, json]
            );
            await this.save();
        } catch (e) {
            console.error(`Failed to set cache for ${key}`, e);
        }
    }

    async clearCache(key: string) {
        const db = await this.getDB();
        if (!db) return;
        await db.run('DELETE FROM discovery_cache WHERE key = ?', [key]);
        await this.save();
    }
    // ---------------------

    // --- Write Queue Implementation ---
    private writeQueue: Promise<any> = Promise.resolve();

    private enqueueWrite<T>(operation: () => Promise<T>): Promise<T> {
        // Chain the operation to the end of the queue
        const nextOperation = this.writeQueue.then(() => operation()).catch(err => {
            console.error("DB Write Error:", err);
            throw err; // Re-throw to caller
        });

        // Update the queue pointer, catching errors so the queue doesn't stall
        this.writeQueue = nextOperation.catch(() => { });

        return nextOperation;
    }

    async addNovel(novel: Novel, skipSave = false) {
        return this.enqueueWrite(async () => {
            console.log("Adding novel to DB:", novel);
            const db = await this.getDB();
            if (!db) {
                console.error("DB not initialized in addNovel");
                return;
            }
            // Single UPSERT: insert if new, update metadata (but preserve lastReadChapterId) if existing
            await db.run(`
                INSERT INTO novels (id, title, author, coverUrl, sourceUrl, category, status, summary, lastReadChapterId, totalChapters, lastFetchedAt)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    title = COALESCE(NULLIF(excluded.title, ''), title),
                    author = COALESCE(NULLIF(excluded.author, ''), author),
                    coverUrl = COALESCE(NULLIF(excluded.coverUrl, ''), coverUrl),
                    sourceUrl = COALESCE(NULLIF(excluded.sourceUrl, ''), sourceUrl),
                    summary = COALESCE(NULLIF(excluded.summary, ''), summary),
                    status = COALESCE(NULLIF(excluded.status, ''), status),
                    category = COALESCE(NULLIF(excluded.category, ''), category),
                    totalChapters = COALESCE(NULLIF(excluded.totalChapters, 0), totalChapters),
                    lastFetchedAt = COALESCE(excluded.lastFetchedAt, lastFetchedAt);
            `, [
                novel.id,
                novel.title,
                novel.author || 'Unknown',
                novel.coverUrl || null,
                novel.sourceUrl,
                novel.category || 'Unknown',
                novel.status || 'Ongoing',
                novel.summary || null,
                novel.totalChapters || 0,
                novel.lastFetchedAt || Math.floor(Date.now() / 1000)
            ]);
            if (!skipSave) {
                await this.save();
            }
            console.log(`[dbService] addNovel complete for ${novel.title} (${novel.id}). Category: ${novel.category}`);
        });
    }

    async addChapter(chapter: Chapter) {
        return this.enqueueWrite(async () => {
            const db = await this.getDB();
            if (!db) return;

            let contentPath = chapter.contentPath;

            // Save content to FS if provided
            if (chapter.content) {
                try {
                    contentPath = await this.saveChapterContent(chapter.novelId, chapter.id, chapter.content);
                } catch (e) {
                    console.error(`[DB] Failed to save chapter content to FS for ${chapter.id}`, e);
                    // Fallback? ensure we don't block metadata save
                }
            }

            // Preserve existing isRead status if the chapter already exists
            const existingResult = await db.query('SELECT isRead FROM chapters WHERE id = ?', [chapter.id]);
            const existing = existingResult.values && existingResult.values.length > 0 ? existingResult.values[0] : null;
            const isRead = existing && existing.isRead !== undefined ? existing.isRead : 0;

            const query = `
            INSERT OR REPLACE INTO chapters (id, novelId, title, content, contentPath, orderIndex, audioPath, isRead, date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
        `;
            await db.run(query, [
                chapter.id,
                chapter.novelId,
                chapter.title,
                null, // content is now NULL
                contentPath || null,
                chapter.orderIndex,
                chapter.audioPath || null,
                isRead,
                chapter.date || null
            ]);
            await this.save();
        });
    }

    async deleteChaptersByNovelId(novelId: string) {
        return this.enqueueWrite(async () => {
            const db = await this.getDB();
            if (!db) return;
            await db.run('DELETE FROM chapters WHERE novelId = ?', [novelId]);
            await this.save();
            console.log(`[dbService] Deleted all chapters for novel: ${novelId}`);
        });
    }

    async addChapters(chapters: Chapter[]) {
        return this.enqueueWrite(async () => {
            const db = await this.getDB();
            if (!db || chapters.length === 0) return;

            console.log(`[dbService] Bulk adding ${chapters.length} chapters...`);

            // 1. Save all content to FS in parallel (or batches)
            const updatedChapters = await Promise.all(chapters.map(async (ch) => {
                if (ch.content) {
                    try {
                        const path = await this.saveChapterContent(ch.novelId, ch.id, ch.content);
                        return { ...ch, contentPath: path, content: null };
                    } catch (e) {
                        console.error(`[DB] Failed to save content for ${ch.id}`, e);
                        return ch;
                    }
                }
                return ch;
            }));

            try {
                const set = updatedChapters.map(chapter => ({
                    statement: `
                        INSERT OR REPLACE INTO chapters (id, novelId, title, content, contentPath, orderIndex, audioPath, isRead, date)
                        VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT MAX(isRead) FROM chapters WHERE id = ? OR audioPath = ?), 0), ?);
                    `,
                    values: [
                        chapter.id,
                        chapter.novelId,
                        chapter.title,
                        null, // content column cleared
                        chapter.contentPath || null,
                        chapter.orderIndex,
                        chapter.audioPath || null,
                        chapter.id, // for COALESCE subquery (by ID)
                        chapter.audioPath || chapter.id, // for COALESCE subquery (by audioPath)
                        chapter.date || null
                    ]
                }));

                const CHUNK_SIZE = 300;
                for (let i = 0; i < set.length; i += CHUNK_SIZE) {
                    const chunk = set.slice(i, i + CHUNK_SIZE);
                    await db.executeSet(chunk);
                    await new Promise(r => setTimeout(r, 0));
                }

                await this.save();
                console.log(`[dbService] Bulk insert complete.`);
            } catch (error) {
                console.error('[dbService] Bulk insert failed:', error);
            }
        });
    }

    async updateNovelMetadata(id: string, metadata: Partial<Novel>) {
        return this.enqueueWrite(async () => {
            const db = await this.getDB();
            if (!db) return;

            try {
                const fields = [];
                const values = [];

                if (metadata.title) { fields.push('title = ?'); values.push(metadata.title); }
                if (metadata.author) { fields.push('author = ?'); values.push(metadata.author); }
                if (metadata.coverUrl) { fields.push('coverUrl = ?'); values.push(metadata.coverUrl); }
                if (metadata.summary) { fields.push('summary = ?'); values.push(metadata.summary); }
                if (metadata.status) { fields.push('status = ?'); values.push(metadata.status); }
                if (metadata.category) { fields.push('category = ?'); values.push(metadata.category); }
                if (metadata.totalChapters !== undefined) { fields.push('totalChapters = ?'); values.push(metadata.totalChapters); }
                if (metadata.lastFetchedAt !== undefined) { fields.push('lastFetchedAt = ?'); values.push(metadata.lastFetchedAt); }

                if (fields.length === 0) return;

                values.push(id);
                const query = `UPDATE novels SET ${fields.join(', ')} WHERE id = ?`;
                await db.run(query, values);
                await this.save();
            } catch (e) {
                console.error(`Failed to update metadata for ${id}`, e);
            }
        });
    }

    async deleteNovel(id: string) {
        return this.enqueueWrite(async () => {
            const db = await this.getDB();
            if (!db) return;

            try {
                const cleanId = id ? id.replace(/\/$/, '').replace(/\/chapters$/i, '') : '';
                const decodedId = id && id.includes('%') ? decodeURIComponent(id).replace(/\/$/, '').replace(/\/chapters$/i, '') : cleanId;
                const encodedId = cleanId ? encodeURIComponent(cleanId) : cleanId;

                // 1. Find all matching novel rows to gather all ID and sourceUrl variants
                const existingResult = await db.query(
                    `SELECT id, sourceUrl FROM novels 
                     WHERE id = ? OR id = ? OR id = ? OR id = ? OR id = ? OR id = ?
                        OR sourceUrl = ? OR sourceUrl = ? OR sourceUrl = ? OR sourceUrl = ?`,
                    [
                        id, cleanId, decodedId, encodedId, cleanId + '/', cleanId + '/chapters',
                        id, cleanId, decodedId, cleanId + '/'
                    ]
                );

                const idsToDelete = new Set<string>([
                    id, cleanId, decodedId, encodedId,
                    cleanId + '/', cleanId + '/chapters',
                    `live-${cleanId}`
                ]);

                if (existingResult.values) {
                    for (const row of existingResult.values) {
                        if (row.id) idsToDelete.add(row.id);
                        if (row.sourceUrl) {
                            idsToDelete.add(row.sourceUrl);
                            idsToDelete.add(row.sourceUrl.replace(/\/$/, ''));
                            idsToDelete.add(encodeURIComponent(row.sourceUrl));
                        }
                    }
                }

                // 2. Delete filesystem directories, memory cache, and localStorage for all variants
                for (const targetId of idsToDelete) {
                    try {
                        const dir = await this.getNovelDir(targetId);
                        await Filesystem.rmdir({
                            path: dir,
                            directory: Directory.Data,
                            recursive: true
                        });
                    } catch (e) { }

                    // Clear in-memory cache
                    chapterListCache.delete(targetId);

                    // Clear localStorage tracking
                    if (typeof localStorage !== 'undefined') {
                        localStorage.removeItem(`lastRead:${targetId}`);
                        localStorage.removeItem(`lastReadAt:${targetId}`);
                        localStorage.removeItem(`scroll-${targetId}`);
                    }
                }

                // 3. Delete from DB tables (both novels and chapters for all target IDs/sourceUrls)
                for (const targetId of idsToDelete) {
                    await db.run('DELETE FROM chapters WHERE novelId = ?', [targetId]);
                    await db.run('DELETE FROM novels WHERE id = ? OR sourceUrl = ?', [targetId, targetId]);
                }

                await this.save();
                console.log(`[dbService] Successfully deleted novel ${id} and all related DB/Cache/FS records.`);
            } catch (e) {
                console.error(`[dbService] Failed to delete novel ${id}`, e);
            }
        });
    }



    async getStats(): Promise<{ chaptersRead: number, novelsCount: number }> {
        const stats = await this.getReadingStats();
        return {
            chaptersRead: stats.chaptersRead,
            novelsCount: stats.novelsCount
        };
    }

    async getReadingStats(): Promise<ReadingStatistics> {
        const db = await this.getDB();
        const fallback: ReadingStatistics = {
            chaptersRead: 0,
            novelsCount: 0,
            totalReadingTimeMinutes: 0,
            currentStreakDays: 0,
            last7Days: []
        };
        if (!db) return fallback;

        try {
            const chaptersResult = await db.query('SELECT COUNT(*) as count FROM chapters WHERE isRead = 1');
            const novelsResult = await db.query('SELECT COUNT(*) as count FROM novels');
            const timeResult = await db.query('SELECT SUM(durationSeconds) as totalSecs FROM reading_sessions');

            const chaptersRead = chaptersResult.values?.[0]?.count || 0;
            const novelsCount = novelsResult.values?.[0]?.count || 0;
            const totalSecs = timeResult.values?.[0]?.totalSecs || 0;
            const totalReadingTimeMinutes = Math.round(totalSecs / 60);

            // Last 7 days history
            const now = new Date();
            const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            const dateMap = new Map<string, number>();

            const sessionsResult = await db.query(
                'SELECT sessionDate, SUM(durationSeconds) as secs FROM reading_sessions GROUP BY sessionDate ORDER BY sessionDate DESC LIMIT 30'
            );
            if (sessionsResult.values) {
                for (const row of sessionsResult.values) {
                    dateMap.set(row.sessionDate, Math.round((row.secs || 0) / 60));
                }
            }

            const last7Days: { date: string; dayName: string; minutes: number }[] = [];
            for (let i = 6; i >= 0; i--) {
                const d = new Date(now);
                d.setDate(d.getDate() - i);
                const iso = d.toISOString().split('T')[0];
                last7Days.push({
                    date: iso,
                    dayName: dayNames[d.getDay()],
                    minutes: dateMap.get(iso) || 0
                });
            }

            // Streak calculation
            let streak = 0;
            const checkDate = new Date(now);
            const todayStr = checkDate.toISOString().split('T')[0];
            const hasReadToday = (dateMap.get(todayStr) || 0) > 0;

            if (hasReadToday) {
                streak++;
                checkDate.setDate(checkDate.getDate() - 1);
            } else {
                checkDate.setDate(checkDate.getDate() - 1);
                const yesterdayStr = checkDate.toISOString().split('T')[0];
                if ((dateMap.get(yesterdayStr) || 0) === 0) {
                    return {
                        chaptersRead,
                        novelsCount,
                        totalReadingTimeMinutes,
                        currentStreakDays: 0,
                        last7Days
                    };
                }
            }

            while (true) {
                const iso = checkDate.toISOString().split('T')[0];
                if ((dateMap.get(iso) || 0) > 0) {
                    streak++;
                    checkDate.setDate(checkDate.getDate() - 1);
                } else {
                    break;
                }
            }

            return {
                chaptersRead,
                novelsCount,
                totalReadingTimeMinutes,
                currentStreakDays: streak,
                last7Days
            };
        } catch (e) {
            console.error("Failed to get reading stats", e);
            return fallback;
        }
    }

    async recordReadingTime(novelId: string, chapterId: string, durationSeconds: number): Promise<void> {
        const db = await this.getDB();
        if (!db || durationSeconds <= 0) return;
        try {
            const today = new Date().toISOString().split('T')[0];
            const sessionId = `rs-${today}-${novelId}-${Math.random().toString(36).slice(2, 7)}`;
            await this.enqueueWrite(async () => {
                await db.run(
                    'INSERT INTO reading_sessions (id, novelId, chapterId, durationSeconds, sessionDate) VALUES (?, ?, ?, ?, ?)',
                    [sessionId, novelId, chapterId, durationSeconds, today]
                );
            });
        } catch (e) {
            console.warn('[DB] Failed to record reading session', e);
        }
    }

    async getCollections(): Promise<Collection[]> {
        const db = await this.getDB();
        if (!db) return [];
        try {
            const query = `
                SELECT c.*, COUNT(nc.novelId) as novelCount
                FROM collections c
                LEFT JOIN novel_collections nc ON nc.collectionId = c.id
                GROUP BY c.id
                ORDER BY c.createdAt ASC;
            `;
            const res = await db.query(query);
            return (res.values as Collection[]) || [];
        } catch (e) {
            console.warn('[DB] Failed to get collections', e);
            return [];
        }
    }

    async createCollection(name: string, color: string = '#6366f1', icon: string = 'bookmark'): Promise<Collection | null> {
        const db = await this.getDB();
        if (!db || !name.trim()) return null;
        const id = `col-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const collection: Collection = { id, name: name.trim(), color, icon, createdAt: Math.floor(Date.now() / 1000), novelCount: 0 };
        await this.enqueueWrite(async () => {
            await db.run(
                'INSERT INTO collections (id, name, color, icon, createdAt) VALUES (?, ?, ?, ?, ?)',
                [id, collection.name, color, icon, collection.createdAt]
            );
        });
        return collection;
    }

    async deleteCollection(id: string): Promise<void> {
        const db = await this.getDB();
        if (!db) return;
        await this.enqueueWrite(async () => {
            await db.run('DELETE FROM novel_collections WHERE collectionId = ?', [id]);
            await db.run('DELETE FROM collections WHERE id = ?', [id]);
        });
    }

    async setNovelCollections(novelId: string, collectionIds: string[]): Promise<void> {
        const db = await this.getDB();
        if (!db) return;
        await this.enqueueWrite(async () => {
            await db.run('DELETE FROM novel_collections WHERE novelId = ?', [novelId]);
            for (const colId of collectionIds) {
                await db.run('INSERT INTO novel_collections (novelId, collectionId) VALUES (?, ?)', [novelId, colId]);
            }
        });
    }

    async getNovels(): Promise<Novel[]> {
        const db = await this.getDB();
        if (!db) {
            console.error("DB not initialized in getNovels");
            return [];
        }

        console.log("Fetching novels from DB...");

        // Optimized query with collections join
        const query = `
            SELECT
                n.*,
                COUNT(DISTINCT c.id) as downloadedChapters,
                SUM(CASE WHEN c.isRead = 1 THEN 1 ELSE 0 END) as readChapters,
                GROUP_CONCAT(DISTINCT nc.collectionId) as collectionIdsStr
            FROM novels n
            LEFT JOIN chapters c ON c.novelId = n.id
            LEFT JOIN novel_collections nc ON nc.novelId = n.id
            GROUP BY n.id
            ORDER BY COALESCE(n.lastReadAt, n.createdAt * 1000) DESC;
        `;

        const result = await db.query(query);
        const novels = (result.values as (Novel & { collectionIdsStr?: string })[]) || [];

        return novels.map(n => {
            let readCount = n.readChapters || 0;
            if (n.lastReadChapterId) {
                const match = n.lastReadChapterId.match(/-ch-(\d+)$/);
                if (match) {
                    const idxCount = parseInt(match[1], 10) + 1;
                    readCount = Math.max(readCount, idxCount);
                }
            }
            const collectionIds = n.collectionIdsStr
                ? n.collectionIdsStr.split(',').filter(Boolean)
                : [];

            return {
                ...n,
                readChapters: readCount,
                collectionIds
            };
        });
    }

    async getChapter(novelId: string, chapterId: string): Promise<Chapter | null> {
        const db = await this.getDB();
        if (!db) return null;

        const cleanNovelId = novelId ? novelId.replace(/\/$/, '').replace(/\/chapters$/i, '') : '';
        const decodedNovelId = novelId && novelId.includes('%') ? decodeURIComponent(novelId).replace(/\/$/, '').replace(/\/chapters$/i, '') : cleanNovelId;
        const novelIdVariants = Array.from(new Set([novelId, cleanNovelId, decodedNovelId, cleanNovelId + '/', cleanNovelId + '/chapters'])).filter(Boolean);
        const placeholders = novelIdVariants.map(() => '?').join(' OR novelId = ');

        // 1. Exact match on id or audioPath (source URL)
        let result = await db.query(
            `SELECT * FROM chapters WHERE (${placeholders ? `novelId = ${placeholders}` : '1=1'}) AND (id = ? OR audioPath = ? OR id = ?) LIMIT 1`,
            [...novelIdVariants, chapterId, chapterId, `${cleanNovelId}-ch-${chapterId}`]
        );

        // 2. OrderIndex match if chapterId contains -ch-(\d+)
        if ((!result.values || result.values.length === 0) && chapterId) {
            const match = chapterId.match(/-ch-(\d+)$/);
            if (match) {
                const orderIdx = parseInt(match[1], 10);
                result = await db.query(
                    `SELECT * FROM chapters WHERE (${placeholders ? `novelId = ${placeholders}` : '1=1'}) AND orderIndex = ? LIMIT 1`,
                    [...novelIdVariants, orderIdx]
                );
            }
        }

        // 3. Fallback: Search globally by id or audioPath if novelId didn't match
        if (!result.values || result.values.length === 0) {
            result = await db.query(
                'SELECT * FROM chapters WHERE id = ? OR audioPath = ? LIMIT 1',
                [chapterId, chapterId]
            );
        }

        if (result.values && result.values.length > 0) {
            const chapter = result.values[0] as Chapter;
            // Try reading from FileSystem if contentPath exists
            if (chapter.contentPath) {
                const fsContent = await this.readChapterContent(chapter.contentPath);
                if (fsContent) {
                    chapter.content = fsContent;
                }
            }
            return chapter;
        }
        return null;
    }

    async getChapters(novelId: string, limit?: number, offset?: number): Promise<Chapter[]> {
        const db = await this.getDB();
        if (!db) return [];

        const cleanId = novelId ? novelId.replace(/\/$/, '').replace(/\/chapters$/i, '') : '';
        const decodedId = novelId && novelId.includes('%') ? decodeURIComponent(novelId).replace(/\/$/, '').replace(/\/chapters$/i, '') : cleanId;

        let query = `
            SELECT id, novelId, title, orderIndex, audioPath, isRead, date, contentPath 
            FROM chapters 
            WHERE novelId = ? OR novelId = ? OR novelId = ? OR novelId = ? OR novelId = ?
            ORDER BY orderIndex ASC
        `;
        const params: any[] = [novelId, cleanId, decodedId, cleanId + '/', cleanId + '/chapters'];

        if (limit !== undefined && offset !== undefined) {
            query += ' LIMIT ? OFFSET ?';
            params.push(limit, offset);
        }

        const result = await db.query(query, params);
        return (result.values as Chapter[]) || [];
    }

    /**
     * Auto-repair: detect and remove duplicate chapters for a novel.
     * Keeps the "best" copy of each chapter (prefers read or downloaded ones).
     * Re-indexes the surviving chapters sequentially (0, 1, 2, ...).
     * Returns true if repairs were made.
     */
    async repairDuplicateChapters(novelId: string): Promise<boolean> {
        const db = await this.getDB();
        if (!db) return false;

        try {
            // Fetch ALL chapter rows for this novel, ordered by orderIndex
            const result = await db.query(
                'SELECT id, novelId, title, orderIndex, audioPath, isRead, date, contentPath FROM chapters WHERE novelId = ? ORDER BY orderIndex ASC',
                [novelId]
            );
            const allChapters = (result.values as Chapter[]) || [];
            if (allChapters.length === 0) return false;

            // Group by audioPath (source URL) to find duplicates
            const byUrl = new Map<string, Chapter[]>();
            for (const ch of allChapters) {
                const key = ch.audioPath || ch.id; // fallback to id if no audioPath
                const group = byUrl.get(key) || [];
                group.push(ch);
                byUrl.set(key, group);
            }

            // Check if there are actually any duplicates
            const hasDuplicates = Array.from(byUrl.values()).some(group => group.length > 1);
            if (!hasDuplicates) return false;

            console.log(`[DB:repair] Found duplicates in ${novelId}, repairing...`);

            // Pick the best copy from each group: prefer read > downloaded > first
            const survivors: Chapter[] = [];
            const idsToDelete: string[] = [];

            for (const [, group] of byUrl) {
                // Sort: read first, then downloaded (contentPath), then lowest orderIndex
                group.sort((a, b) => {
                    if (a.isRead && !b.isRead) return -1;
                    if (!a.isRead && b.isRead) return 1;
                    if (a.contentPath && !b.contentPath) return -1;
                    if (!a.contentPath && b.contentPath) return 1;
                    return (a.orderIndex ?? 0) - (b.orderIndex ?? 0);
                });

                survivors.push(group[0]); // Keep the best one
                for (let i = 1; i < group.length; i++) {
                    idsToDelete.push(group[i].id);
                }
            }

            if (idsToDelete.length === 0) return false;

            console.log(`[DB:repair] Removing ${idsToDelete.length} duplicate chapters, keeping ${survivors.length}`);

            // Delete duplicates
            return this.enqueueWrite(async () => {
                const db2 = await this.getDB();
                if (!db2) return false;

                // Delete in batches
                const BATCH = 100;
                for (let i = 0; i < idsToDelete.length; i += BATCH) {
                    const batch = idsToDelete.slice(i, i + BATCH);
                    const placeholders = batch.map(() => '?').join(',');
                    await db2.run(`DELETE FROM chapters WHERE id IN (${placeholders})`, batch);
                }

                // Re-index survivors sequentially by their original order
                survivors.sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
                for (let i = 0; i < survivors.length; i++) {
                    const ch = survivors[i];
                    const newId = `${novelId}-ch-${i}`;
                    if (ch.orderIndex !== i || ch.id !== newId) {
                        await db2.run(
                            'UPDATE chapters SET orderIndex = ?, id = ? WHERE id = ?',
                            [i, newId, ch.id]
                        );
                    }
                }

                await this.save();
                console.log(`[DB:repair] Repair complete for ${novelId}: ${survivors.length} chapters, ${idsToDelete.length} duplicates removed`);
                return true;
            }) as Promise<boolean>;
        } catch (e) {
            console.error(`[DB:repair] Failed for ${novelId}`, e);
            return false;
        }
    }

    // --- Maintenance Methods ---

    async vacuum() {
        const db = await this.getDB();
        if (!db) return;
        try {
            await db.execute('VACUUM;');
            console.log('[DB] VACUUM completed');
        } catch (e) {
            console.error('[DB] VACUUM failed', e);
        }
    }

    async integrityCheck(): Promise<boolean> {
        const db = await this.getDB();
        if (!db) return false;
        try {
            const result = await db.query('PRAGMA integrity_check;');
            if (result.values && result.values.length > 0) {
                const status = result.values[0].integrity_check;
                console.log(`[DB] Integrity Check: ${status}`);
                return status === 'ok';
            }
        } catch (e) {
            console.error('[DB] Integrity Check failed', e);
        }
        return false;
    }

    async cleanupCache(ttlSeconds: number = 24 * 60 * 60) { // Default 24h
        const db = await this.getDB();
        if (!db) return;
        try {
            const cutoff = Math.floor(Date.now() / 1000) - ttlSeconds;
            await db.run('DELETE FROM discovery_cache WHERE timestamp < ?', [cutoff]);
            await this.save();
            console.log('[DB] Cache cleanup completed');
        } catch (e) {
            console.error('[DB] Cache cleanup failed', e);
        }
    }

    async isChapterExists(novelId: string, audioPath: string): Promise<boolean> {
        const db = await this.getDB();
        if (!db) return false;
        const result = await db.query('SELECT id FROM chapters WHERE novelId = ? AND audioPath = ? LIMIT 1', [novelId, audioPath]);
        return !!(result.values && result.values.length > 0);
    }

    async getNovel(id: string): Promise<Novel | null> {
        const db = await this.getDB();
        if (!db) return null;

        const cleanId = id ? id.replace(/\/$/, '').replace(/\/chapters$/i, '') : '';
        const decodedId = id && id.includes('%') ? decodeURIComponent(id).replace(/\/$/, '').replace(/\/chapters$/i, '') : cleanId;

        // Use JOIN to get dynamic accurate count of read chapters with URL variant matching
        const query = `
            SELECT 
                n.*,
                (SELECT COUNT(*) FROM chapters c WHERE c.novelId = n.id) as downloadedChapters,
                (SELECT COUNT(*) FROM chapters c WHERE c.novelId = n.id AND c.isRead = 1) as readChapters
            FROM novels n
            WHERE n.id = ? OR n.id = ? OR n.id = ? OR n.id = ? OR n.id = ?
               OR n.sourceUrl = ? OR n.sourceUrl = ? OR n.sourceUrl = ? OR n.sourceUrl = ?
            LIMIT 1
        `;

        const result = await db.query(query, [
            id, cleanId, decodedId, cleanId + '/', cleanId + '/chapters',
            id, cleanId, decodedId, cleanId + '/'
        ]);
        return result.values && result.values.length > 0 ? (result.values[0] as Novel) : null;
    }

    async getNextChapter(novelId: string, currentOrderIndex: number): Promise<Chapter | null> {
        const db = await this.getDB();
        if (!db) return null;
        const result = await db.query(
            'SELECT * FROM chapters WHERE novelId = ? AND orderIndex > ? ORDER BY orderIndex ASC LIMIT 1',
            [novelId, currentOrderIndex]
        );
        return result.values && result.values.length > 0 ? (result.values[0] as Chapter) : null;
    }

    async getPrevChapter(novelId: string, currentOrderIndex: number): Promise<Chapter | null> {
        const db = await this.getDB();
        if (!db) return null;
        const result = await db.query(
            'SELECT * FROM chapters WHERE novelId = ? AND orderIndex < ? ORDER BY orderIndex DESC LIMIT 1',
            [novelId, currentOrderIndex]
        );
        return result.values && result.values.length > 0 ? (result.values[0] as Chapter) : null;
    }

    async updateReadingProgress(novelId: string, chapterId: string, chapterUrl?: string) {
        return this.enqueueWrite(async () => {
            const db = await this.getDB();
            if (!db) return;

            try {
                const cleanNovelId = novelId ? novelId.replace(/\/$/, '').replace(/\/chapters$/i, '') : '';
                const decodedNovelId = novelId && novelId.includes('%') ? decodeURIComponent(novelId).replace(/\/$/, '').replace(/\/chapters$/i, '') : cleanNovelId;
                const encodedNovelId = cleanNovelId ? encodeURIComponent(cleanNovelId) : cleanNovelId;

                // Update novel's lastReadChapterId and timestamp across all potential ID & sourceUrl variants
                const res = await db.run(
                    `UPDATE novels SET lastReadChapterId = ?, lastReadAt = ? 
                     WHERE id = ? OR id = ? OR id = ? OR id = ? OR id = ? OR id = ?
                        OR sourceUrl = ? OR sourceUrl = ? OR sourceUrl = ? OR sourceUrl = ?`,
                    [
                        chapterId, Date.now(),
                        novelId, cleanNovelId, decodedNovelId, encodedNovelId, cleanNovelId + '/', cleanNovelId + '/chapters',
                        novelId, cleanNovelId, decodedNovelId, cleanNovelId + '/'
                    ]
                );

                const changes = res.changes?.changes || 0;
                console.log(`[DB] updateReadingProgress: novelId=${novelId}, chapterId=${chapterId}, rowsUpdated=${changes}`);

                // ALWAYS sync to localStorage so SQLite and localStorage remain 100% consistent
                if (typeof localStorage !== 'undefined') {
                    localStorage.setItem(`lastRead:${novelId}`, chapterId);
                    if (cleanNovelId) localStorage.setItem(`lastRead:${cleanNovelId}`, chapterId);
                    if (decodedNovelId) localStorage.setItem(`lastRead:${decodedNovelId}`, chapterId);
                    localStorage.setItem(`lastReadAt:${novelId}`, Date.now().toString());
                }

                // Mark chapter as read (and ensure stub exists in DB for live chapters)
                let orderIdx = -1;
                const matchIdx = chapterId.match(/-ch-(\d+)$/);
                if (matchIdx) {
                    orderIdx = parseInt(matchIdx[1], 10);
                } else {
                    // Try looking up orderIndex from existing chapter record
                    const found = await db.query(
                        'SELECT orderIndex FROM chapters WHERE (novelId = ? OR novelId = ? OR novelId = ?) AND (id = ? OR audioPath = ?) LIMIT 1',
                        [novelId, cleanNovelId, decodedNovelId, chapterId, chapterUrl || chapterId]
                    );
                    if (found.values && found.values.length > 0 && typeof found.values[0].orderIndex === 'number') {
                        orderIdx = found.values[0].orderIndex;
                    }
                }
                if (orderIdx < 0) orderIdx = 0;

                const targetNovelId = cleanNovelId || novelId;

                // Ensure novel exists in novels table to satisfy FOREIGN KEY constraint for chapters
                if (changes === 0) {
                    await db.run(`
                        INSERT OR IGNORE INTO novels (id, title, sourceUrl, lastReadChapterId, lastReadAt)
                        VALUES (?, 'Unknown', ?, ?, ?)
                    `, [targetNovelId, novelId, chapterId, Date.now()]);
                }

                await db.run(`
                    INSERT INTO chapters (id, novelId, title, content, contentPath, orderIndex, audioPath, isRead, date)
                    VALUES (?, ?, 'Chapter', NULL, NULL, ?, ?, 1, NULL)
                    ON CONFLICT(id) DO UPDATE SET isRead = 1, audioPath = COALESCE(excluded.audioPath, audioPath);
                `, [chapterId, targetNovelId, orderIdx, chapterUrl || chapterId]);

                if (chapterUrl && chapterUrl !== chapterId) {
                    await db.run(`
                        INSERT INTO chapters (id, novelId, title, content, contentPath, orderIndex, audioPath, isRead, date)
                        VALUES (?, ?, 'Chapter', NULL, NULL, ?, ?, 1, NULL)
                        ON CONFLICT(id) DO UPDATE SET isRead = 1;
                    `, [chapterUrl, targetNovelId, orderIdx, chapterUrl]);
                }

                // Mark this specific chapter as read
                await db.run(
                    'UPDATE chapters SET isRead = 1 WHERE (novelId = ? OR novelId = ? OR novelId = ?) AND (id = ? OR id = ? OR audioPath = ?)',
                    [novelId, cleanNovelId, decodedNovelId, chapterId, `${novelId}-ch-${chapterId}`, chapterUrl || chapterId]
                );

                // Mark ALL chapters up to current orderIndex as read
                if (orderIdx >= 0) {
                    await db.run(
                        'UPDATE chapters SET isRead = 1 WHERE (novelId = ? OR novelId = ? OR novelId = ? OR novelId = ? OR novelId = ?) AND orderIndex <= ?',
                        [novelId, cleanNovelId, decodedNovelId, cleanNovelId + '/', cleanNovelId + '/chapters', orderIdx]
                    );
                }

                // Update the novel's total readChapters count
                await db.run(
                    `UPDATE novels SET readChapters = (
                        SELECT COUNT(DISTINCT orderIndex) FROM chapters 
                        WHERE (novelId = ? OR novelId = ? OR novelId = ?) AND isRead = 1
                    ) WHERE id = ? OR id = ? OR id = ?`,
                    [novelId, cleanNovelId, decodedNovelId, novelId, cleanNovelId, decodedNovelId]
                );

                await this.save();
            } catch (error) {
                console.error('[DB] updateReadingProgress error:', error);
            }
        });
    }

    async updateChapterContent(novelId: string, chapterId: string, content: string) {
        return this.enqueueWrite(async () => {
            const db = await this.getDB();
            if (!db) return;

            try {
                // 1. Save to Filesystem
                const contentPath = await this.saveChapterContent(novelId, chapterId, content);

                // 2. Update DB: set contentPath and clear legacy content column
                await db.run('UPDATE chapters SET contentPath = ?, content = NULL WHERE id = ? AND novelId = ?', [contentPath, chapterId, novelId]);
                await this.save();
                console.log(`Chapter ${chapterId} content updated successfully to ${contentPath}`);
            } catch (e) {
                console.error("Failed to update chapter content", e);
                throw e;
            }
        });
    }

    async getSummary(chapterId: string, type: 'extractive' | 'events' | 'providerUsed'): Promise<string | null> {
        const db = await this.getDB();
        if (!db) return null;
        try {
            const result = await db.query(
                'SELECT summaryText FROM chapter_summaries WHERE chapterId = ? AND summaryType = ?',
                [chapterId, type]
            );
            return result.values && result.values.length > 0 ? result.values[0].summaryText : null;
        } catch (e) {
            console.error("Failed to get summary", e);
            return null;
        }
    }

    async saveSummary(chapterId: string, type: 'extractive' | 'events' | 'providerUsed', text: string) {
        return this.enqueueWrite(async () => {
            const db = await this.getDB();
            if (!db) return;
            try {
                await db.run(
                    'INSERT OR REPLACE INTO chapter_summaries (chapterId, summaryType, summaryText) VALUES (?, ?, ?)',
                    [chapterId, type, text]
                );
                await this.save();
            } catch (e) {
                console.error("Failed to save summary", e);
            }
        });
    }
}

export const dbService = new DatabaseService();
