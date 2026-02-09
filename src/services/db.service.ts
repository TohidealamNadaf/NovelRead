import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';
import { Capacitor } from '@capacitor/core';


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
    createdAt?: number;
}

export interface Chapter {
    id: string;
    novelId: string;
    title: string;
    content?: string;
    orderIndex: number;
    audioPath?: string;
    isRead?: number;
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
                    createdAt INTEGER DEFAULT (strftime('%s', 'now'))
                );

                CREATE TABLE IF NOT EXISTS chapters (
                    id TEXT PRIMARY KEY,
                    novelId TEXT NOT NULL,
                    title TEXT NOT NULL,
                    content TEXT,
                    orderIndex INTEGER NOT NULL,
                    audioPath TEXT,
                    isRead INTEGER DEFAULT 0,
                    FOREIGN KEY(novelId) REFERENCES novels(id) ON DELETE CASCADE
                );
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

            // Migration: Ensure new columns exist for older databases
            const columnsToAdd = [
                { name: 'summary', type: 'TEXT' },
                { name: 'category', type: 'TEXT' },
                { name: 'status', type: 'TEXT' }
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
        } catch (error) {
            console.error("Database initialization failed", error);
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

    async addNovel(novel: Novel) {
        const db = await this.getDB();
        if (!db) return;
        const query = `
            INSERT OR REPLACE INTO novels (id, title, author, coverUrl, sourceUrl, category, status, summary, lastReadChapterId)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
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
            null
        ]);
        await this.save();
    }

    async addChapter(chapter: Chapter) {
        const db = await this.getDB();
        if (!db) return;
        const query = `
            INSERT OR REPLACE INTO chapters (id, novelId, title, content, orderIndex, audioPath, isRead)
            VALUES (?, ?, ?, ?, ?, ?, 0);
        `;
        await db.run(query, [chapter.id, chapter.novelId, chapter.title, chapter.content, chapter.orderIndex, chapter.audioPath || null]);
        await this.save();
    }

    async getNovels(): Promise<Novel[]> {
        const db = await this.getDB();
        if (!db) return [];
        const result = await db.query('SELECT * FROM novels ORDER BY createdAt DESC');
        return (result.values as Novel[]) || [];
    }

    async getNovel(id: string): Promise<Novel | null> {
        const db = await this.getDB();
        if (!db) return null;
        const result = await db.query('SELECT * FROM novels WHERE id = ?', [id]);
        return result.values && result.values.length > 0 ? (result.values[0] as Novel) : null;
    }

    async getChapters(novelId: string): Promise<Chapter[]> {
        const db = await this.getDB();
        if (!db) return [];
        const result = await db.query('SELECT * FROM chapters WHERE novelId = ? ORDER BY orderIndex ASC', [novelId]);
        return (result.values as Chapter[]) || [];
    }

    async isChapterExists(novelId: string, audioPath: string): Promise<boolean> {
        const db = await this.getDB();
        if (!db) return false;
        const result = await db.query('SELECT id FROM chapters WHERE novelId = ? AND audioPath = ? LIMIT 1', [novelId, audioPath]);
        return !!(result.values && result.values.length > 0);
    }

    async getChapter(novelId: string, chapterId: string): Promise<Chapter | null> {
        const db = await this.getDB();
        if (!db) return null;
        const result = await db.query('SELECT * FROM chapters WHERE novelId = ? AND id = ?', [novelId, chapterId]);
        return result.values && result.values.length > 0 ? (result.values[0] as Chapter) : null;
    }
    async deleteNovel(id: string) {
        const db = await this.getDB();
        if (!db) return;

        try {
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
            // Update novel's lastReadChapterId
            await db.run('UPDATE novels SET lastReadChapterId = ? WHERE id = ?', [chapterId, novelId]);
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
            await db.run('UPDATE chapters SET content = ? WHERE id = ? AND novelId = ?', [content, chapterId, novelId]);
            await this.save();
            console.log(`Chapter ${chapterId} content updated successfully`);
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
