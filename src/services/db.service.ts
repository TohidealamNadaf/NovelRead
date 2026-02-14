import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';


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

    constructor() {
        this.sqlite = new SQLiteConnection(CapacitorSQLite);
    }

    async initialize() {
        if (this.db) return;

        try {
            if (Capacitor.getPlatform() === 'web') {
                const jeepSqlite = document.querySelector('jeep-sqlite');
                if (jeepSqlite) {
                    await customElements.whenDefined('jeep-sqlite');
                    await this.sqlite.initWebStore();
                } else {
                    console.error("jeep-sqlite element not found in DOM");
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
    private async getNovelDir(novelId: string): Promise<string> {
        return `NOVEL_DATA/${novelId}`;
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

            const fileName = `${chapterId}.txt`;
            const filePath = `${dir}/${fileName}`;

            await Filesystem.writeFile({
                path: filePath,
                data: content,
                directory: Directory.Data,
                encoding: Encoding.UTF8
            });

            return filePath;
        } catch (e) {
            console.error(`[FS] Failed to save chapter content: ${e}`);
            // Fallback: return empty string or throw? For now throw to handle upstream
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

    async addNovel(novel: Novel) {
        console.log("Adding novel to DB:", novel);
        const db = await this.getDB();
        if (!db) {
            console.error("DB not initialized in addNovel");
            return;
        }
        // Use INSERT OR IGNORE so we never overwrite an existing novel's progress
        const query = `
        INSERT OR IGNORE INTO novels (id, title, author, coverUrl, sourceUrl, category, status, summary, lastReadChapterId, totalChapters, lastFetchedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `;
        await db.run(query, [
            novel.id,
            novel.title,
            novel.author || 'Unknown',
            novel.coverUrl || null,
            novel.sourceUrl,
            novel.category || 'Unknown',
            novel.status || 'Ongoing',
            novel.summary || null,
            null,
            novel.totalChapters || 0,
            novel.lastFetchedAt || Math.floor(Date.now() / 1000)
        ]);
        // Update metadata fields (but NOT lastReadChapterId) for existing novels
        // Also update totalChapters and lastFetchedAt if provided
        await db.run(`
        UPDATE novels SET
            title = COALESCE(?, title),
            author = COALESCE(?, author),
            coverUrl = COALESCE(?, coverUrl),
            sourceUrl = COALESCE(?, sourceUrl),
            summary = COALESCE(?, summary),
            status = COALESCE(?, status),
            category = COALESCE(?, category),
            totalChapters = COALESCE(?, totalChapters),
            lastFetchedAt = COALESCE(?, lastFetchedAt)
        WHERE id = ?
    `, [
            novel.title || null,
            novel.author || null,
            novel.coverUrl || null,
            novel.sourceUrl || null,
            novel.summary || null,
            novel.status || null,
            novel.category || null,
            novel.totalChapters || null,
            novel.lastFetchedAt || Math.floor(Date.now() / 1000),
            novel.id
        ]);
        await this.save();
        console.log(`[dbService] addNovel complete for ${novel.title} (${novel.id}). Category: ${novel.category}`);
    }

    async addChapter(chapter: Chapter) {
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
    }

    async addChapters(chapters: Chapter[]) {
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
                    VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT isRead FROM chapters WHERE id = ?), 0), ?);
                `,
                values: [
                    chapter.id,
                    chapter.novelId,
                    chapter.title,
                    null, // content column cleared
                    chapter.contentPath || null,
                    chapter.orderIndex,
                    chapter.audioPath || null,
                    chapter.id, // for COALESCE subquery
                    chapter.date || null
                ]
            }));

            await db.executeSet(set);
            await this.save();
            console.log(`[dbService] Bulk insert complete.`);
        } catch (error) {
            console.error('[dbService] Bulk insert failed:', error);
        }
    }

    async getStats(): Promise<{ chaptersRead: number, novelsCount: number }> {
        const db = await this.getDB();
        if (!db) return { chaptersRead: 0, novelsCount: 0 };

        try {
            const chaptersResult = await db.query('SELECT COUNT(*) as count FROM chapters WHERE isRead = 1');
            const novelsResult = await db.query('SELECT COUNT(*) as count FROM novels');

            return {
                chaptersRead: chaptersResult.values && chaptersResult.values.length > 0 ? chaptersResult.values[0].count : 0,
                novelsCount: novelsResult.values && novelsResult.values.length > 0 ? novelsResult.values[0].count : 0
            };
        } catch (e) {
            console.error("Failed to get stats", e);
            return { chaptersRead: 0, novelsCount: 0 };
        }
    }

    async getNovels(): Promise<Novel[]> {
        const db = await this.getDB();
        if (!db) {
            console.error("DB not initialized in getNovels");
            return [];
        }

        console.log("Fetching novels from DB...");

        // Query to get novels with chapter counts
        // We use a LEFT JOIN on chapters to count
        const query = `
SELECT
n.*,
    COUNT(c.id) as totalChapters,
    SUM(CASE WHEN c.isRead = 1 THEN 1 ELSE 0 END) as readChapters
            FROM novels n
            LEFT JOIN chapters c ON n.id = c.novelId
            GROUP BY n.id
            ORDER BY n.lastReadAt DESC, n.createdAt DESC;
`;

        const result = await db.query(query);
        return (result.values as Novel[]) || [];
    }

    async getChapter(novelId: string, chapterId: string): Promise<Chapter | null> {
        const db = await this.getDB();
        if (!db) return null;
        const result = await db.query('SELECT * FROM chapters WHERE novelId = ? AND id = ?', [novelId, chapterId]);

        if (result.values && result.values.length > 0) {
            const chapter = result.values[0] as Chapter;
            // 1. Try reading from FileSystem if contentPath exists
            if (chapter.contentPath) {
                const fsContent = await this.readChapterContent(chapter.contentPath);
                if (fsContent) {
                    chapter.content = fsContent;
                }
            }
            // 2. Fallback: If content is in DB (legacy), it's already in chapter.content

            return chapter;
        }
        return null;
    }

    async getChapters(novelId: string, limit?: number, offset?: number): Promise<Chapter[]> {
        const db = await this.getDB();
        if (!db) return [];

        let query = 'SELECT id, novelId, title, orderIndex, audioPath, isRead, date, contentPath FROM chapters WHERE novelId = ? ORDER BY orderIndex ASC';
        const params: any[] = [novelId];

        if (limit !== undefined && offset !== undefined) {
            query += ' LIMIT ? OFFSET ?';
            params.push(limit, offset);
        }

        const result = await db.query(query, params);
        return (result.values as Chapter[]) || [];
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

        // Use JOIN to get dynamic accurate count of read chapters
        const query = `
            SELECT 
                n.*,
                (SELECT COUNT(*) FROM chapters c WHERE c.novelId = n.id) as totalChapters,
                (SELECT COUNT(*) FROM chapters c WHERE c.novelId = n.id AND c.isRead = 1) as readChapters
            FROM novels n
            WHERE n.id = ?
        `;

        const result = await db.query(query, [id]);
        return result.values && result.values.length > 0 ? (result.values[0] as Novel) : null;
    }

    async updateNovelMetadata(id: string, metadata: Partial<Novel>) {
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

            if (fields.length === 0) return;

            const query = `UPDATE novels SET ${fields.join(', ')} WHERE id = ? `;
            values.push(id);

            await db.run(query, values);
            await this.save();
        } catch (e) {
            console.error("Failed to update novel metadata", e);
            throw e;
        }
    }

    async deleteNovel(id: string) {
        const db = await this.getDB();
        if (!db) return;

        try {
            // 1. Delete FS content
            try {
                const dir = await this.getNovelDir(id);
                await Filesystem.rmdir({
                    path: dir,
                    directory: Directory.Data,
                    recursive: true
                });
            } catch (fsErr) {
                console.warn(`[FS] Failed to delete novel directory for ${id}`, fsErr);
            }

            // 2. Delete DB records & Save
            await db.run('DELETE FROM chapters WHERE novelId = ?', [id]);
            await db.run('DELETE FROM novels WHERE id = ?', [id]);
            await this.save();
        } catch (e) {
            console.error("Failed to delete novel", e);
            throw e;
        }
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

    async updateReadingProgress(novelId: string, chapterId: string) {
        const db = await this.getDB();
        if (!db) return;

        try {
            // Update novel's lastReadChapterId and timestamp
            const res = await db.run('UPDATE novels SET lastReadChapterId = ?, lastReadAt = ? WHERE id = ?', [chapterId, Date.now(), novelId]);

            // Fallback for Live novels (not in DB)
            const changes = res.changes?.changes || 0;
            if (changes === 0 && typeof localStorage !== 'undefined') {
                localStorage.setItem(`lastRead:${novelId}`, chapterId);
                localStorage.setItem(`lastReadAt:${novelId}`, Date.now().toString());
            }

            // Mark chapter as read
            await db.run('UPDATE chapters SET isRead = 1 WHERE id = ?', [chapterId]);
            await this.save();
        } catch (e) {
            console.error("Failed to update reading progress", e);
        }
    }

    async updateChapterContent(novelId: string, chapterId: string, content: string) {
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
    }

    async getSummary(chapterId: string, type: 'extractive' | 'events'): Promise<string | null> {
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

    async saveSummary(chapterId: string, type: 'extractive' | 'events', text: string) {
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
    }
}

export const dbService = new DatabaseService();
