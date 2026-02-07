import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';
import { Capacitor } from '@capacitor/core';


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

            const schema = `
                CREATE TABLE IF NOT EXISTS novels (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    author TEXT,
                    coverUrl TEXT,
                    sourceUrl TEXT NOT NULL,
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

    async addNovel(novel: { id: string; title: string; author: string; coverUrl: string; sourceUrl: string; category?: string }) {
        const db = await this.getDB();
        if (!db) return;
        const query = `
            INSERT OR REPLACE INTO novels (id, title, author, coverUrl, sourceUrl, category, lastReadChapterId)
            VALUES (?, ?, ?, ?, ?, ?, ?);
        `;
        await db.run(query, [novel.id, novel.title, novel.author, novel.coverUrl, novel.sourceUrl, novel.category || 'Unknown', null]);
        await this.save();
    }

    async addChapter(chapter: { id: string; novelId: string; title: string; content: string; orderIndex: number; audioPath?: string }) {
        const db = await this.getDB();
        if (!db) return;
        const query = `
            INSERT OR REPLACE INTO chapters (id, novelId, title, content, orderIndex, audioPath, isRead)
            VALUES (?, ?, ?, ?, ?, ?, 0);
        `;
        await db.run(query, [chapter.id, chapter.novelId, chapter.title, chapter.content, chapter.orderIndex, chapter.audioPath || null]);
        await this.save();
    }

    async getNovels() {
        const db = await this.getDB();
        if (!db) return [];
        const result = await db.query('SELECT * FROM novels ORDER BY createdAt DESC');
        return result.values || [];
    }

    async getNovel(id: string) {
        const db = await this.getDB();
        if (!db) return null;
        const result = await db.query('SELECT * FROM novels WHERE id = ?', [id]);
        return result.values && result.values.length > 0 ? result.values[0] : null;
    }

    async getChapters(novelId: string) {
        const db = await this.getDB();
        if (!db) return [];
        const result = await db.query('SELECT * FROM chapters WHERE novelId = ? ORDER BY orderIndex ASC', [novelId]);
        return result.values || [];
    }

    async getChapter(novelId: string, chapterId: string) {
        const db = await this.getDB();
        if (!db) return null;
        const result = await db.query('SELECT * FROM chapters WHERE novelId = ? AND id = ?', [novelId, chapterId]);
        return result.values && result.values.length > 0 ? result.values[0] : null;
    }
}

export const dbService = new DatabaseService();
