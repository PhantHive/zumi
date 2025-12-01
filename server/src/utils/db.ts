import sqlite3 from 'sqlite3';
import { Database } from 'sqlite3';
import { DatabaseConfig } from '../types/interfaces.js';
import { Song } from '../../../shared/types/common.js';
import path from 'path';

export const GENRES = [
    'Epic',
    'Rap',
    'K-Pop',
    'Lo-fi',
    'Emotional',
    'Inspirational',
    'Pop',
    'Ambient',
    'Cinematic',
] as const;

export type Genre = (typeof GENRES)[number];

// Database row type (what we get from SQLite)
interface SongRow {
    id: number;
    title: string;
    artist: string;
    duration: number;
    filepath: string;
    albumId: string;
    thumbnailUrl: string | null;
    cover_art: string | null;
    genre: Genre;
    uploadedBy: string | null;
    visibility: 'public' | 'private';
    year: number | null;
    bpm: number | null;
    mood: string | null;
    language: string | null;
    lyrics: string | null;
    playCount: number;
    tags: string | null;
}

interface AlbumRow {
    albumId: string;
}

interface ArtistRow {
    artist: string;
}

// Convert SongRow to Song type
const convertSongRow = (row: SongRow): Song => ({
    id: row.id,
    title: row.title,
    artist: row.artist,
    genre: row.genre,
    duration: row.duration,
    filepath: row.filepath,
    albumId: row.albumId,
    thumbnailUrl: row.thumbnailUrl || undefined,
    uploadedBy: row.uploadedBy || undefined,
    visibility: row.visibility,
    year: row.year || undefined,
    bpm: row.bpm || undefined,
    mood: row.mood || undefined,
    language: row.language || undefined,
    lyrics: row.lyrics || undefined,
    playCount: row.playCount,
    tags: row.tags ? row.tags.split(',').map((t) => t.trim()) : undefined,
});

export class DbClient {
    private db: Database;

    constructor(config: DatabaseConfig) {
        this.db = new sqlite3.Database(config.filename);
        this.initDb();
    }

    private initDb(): void {
        this.db.serialize(() => {
            this.db.run(`
        CREATE TABLE IF NOT EXISTS songs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          artist TEXT NOT NULL,
          duration INTEGER,
          filepath TEXT NOT NULL,
          albumId TEXT DEFAULT 'kpop',
          thumbnailUrl TEXT,
          cover_art TEXT,
          genre TEXT CHECK(genre IN ('${GENRES.join("','")}')) NOT NULL DEFAULT 'K-Pop',
          uploadedBy TEXT,
          visibility TEXT CHECK(visibility IN ('public', 'private')) NOT NULL DEFAULT 'public',
          year INTEGER,
          bpm INTEGER,
          mood TEXT,
          language TEXT,
          lyrics TEXT,
          playCount INTEGER DEFAULT 0,
          tags TEXT
        )
      `);

            // Auto-migration: Add new columns if they don't exist
            this.runMigrations();
        });
    }

    private runMigrations(): void {
        // Check existing columns and add missing ones
        this.db.all(
            'PRAGMA table_info(songs)',
            [],
            (err, columns: Array<{ name: string }>) => {
                if (err) {
                    console.error('Error checking table structure:', err);
                    return;
                }

                const columnNames = columns.map((col) => col.name);
                const migrations = [
                    {
                        name: 'uploadedBy',
                        sql: 'ALTER TABLE songs ADD COLUMN uploadedBy TEXT',
                    },
                    {
                        name: 'visibility',
                        sql: "ALTER TABLE songs ADD COLUMN visibility TEXT CHECK(visibility IN ('public', 'private')) DEFAULT 'public'",
                    },
                    {
                        name: 'year',
                        sql: 'ALTER TABLE songs ADD COLUMN year INTEGER',
                    },
                    {
                        name: 'bpm',
                        sql: 'ALTER TABLE songs ADD COLUMN bpm INTEGER',
                    },
                    {
                        name: 'mood',
                        sql: 'ALTER TABLE songs ADD COLUMN mood TEXT',
                    },
                    {
                        name: 'language',
                        sql: 'ALTER TABLE songs ADD COLUMN language TEXT',
                    },
                    {
                        name: 'lyrics',
                        sql: 'ALTER TABLE songs ADD COLUMN lyrics TEXT',
                    },
                    {
                        name: 'playCount',
                        sql: 'ALTER TABLE songs ADD COLUMN playCount INTEGER DEFAULT 0',
                    },
                    {
                        name: 'tags',
                        sql: 'ALTER TABLE songs ADD COLUMN tags TEXT',
                    },
                ];

                migrations.forEach(({ name, sql }) => {
                    if (!columnNames.includes(name)) {
                        this.db.run(sql, (err) => {
                            if (err) {
                                console.error(
                                    `Error adding column ${name}:`,
                                    err,
                                );
                            } else {
                                console.log(
                                    `✓ Migration: Added column ${name}`,
                                );
                            }
                        });
                    }
                });

                // Set default values for existing songs
                setTimeout(() => {
                    this.db.run(
                        "UPDATE songs SET visibility = 'public' WHERE visibility IS NULL",
                        (err) => {
                            if (err)
                                console.error(
                                    'Error setting default visibility:',
                                    err,
                                );
                        },
                    );
                    this.db.run(
                        'UPDATE songs SET playCount = 0 WHERE playCount IS NULL',
                        (err) => {
                            if (err)
                                console.error(
                                    'Error setting default playCount:',
                                    err,
                                );
                        },
                    );
                }, 500);
            },
        );
    }

    async getUniqueAlbums(): Promise<string[]> {
        return new Promise((resolve, reject) => {
            this.db.all<AlbumRow>(
                'SELECT DISTINCT albumId FROM songs',
                [],
                (err, rows) => {
                    if (err) reject(err);
                    resolve(rows.map((row) => row.albumId));
                },
            );
        });
    }

    async getUniqueArtists(): Promise<string[]> {
        return new Promise((resolve, reject) => {
            this.db.all<ArtistRow>(
                'SELECT DISTINCT artist FROM songs',
                [],
                (err, rows) => {
                    if (err) reject(err);
                    resolve(rows.map((row) => row.artist));
                },
            );
        });
    }

    async getSongById(id: number): Promise<Song | null> {
        return new Promise((resolve, reject) => {
            this.db.get<SongRow>(
                'SELECT * FROM songs WHERE id = ?',
                [id],
                (err, row) => {
                    if (err) reject(err);
                    resolve(row ? convertSongRow(row) : null);
                },
            );
        });
    }

    async createSong(song: Partial<Song> & { genre?: Genre }): Promise<Song> {
        const sql = `
      INSERT INTO songs (
        title, artist, duration, filepath, albumId, thumbnailUrl, genre,
        uploadedBy, visibility, year, bpm, mood, language, lyrics, tags
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

        return new Promise((resolve, reject) => {
            this.db.run(
                sql,
                [
                    song.title,
                    song.artist,
                    song.duration,
                    song.filepath,
                    song.albumId,
                    song.thumbnailUrl,
                    song.genre || 'K-Pop',
                    song.uploadedBy || null,
                    song.visibility || 'public',
                    song.year || null,
                    song.bpm || null,
                    song.mood || null,
                    song.language || null,
                    song.lyrics || null,
                    song.tags ? song.tags.join(', ') : null,
                ],
                function (err: Error | null) {
                    if (err) {
                        reject(err);
                        return;
                    }
                    const lastId = this.lastID;
                    // Fetch the created song by ID
                    db.getSongById(lastId)
                        .then((newSong) => {
                            if (!newSong)
                                reject(new Error('Failed to create song'));
                            else resolve(newSong);
                        })
                        .catch(reject);
                },
            );
        });
    }

    async getAllSongs(userEmail?: string): Promise<Song[]> {
        return new Promise((resolve, reject) => {
            let sql =
                'SELECT * FROM songs WHERE visibility = ? OR visibility IS NULL';
            const params: (string | number)[] = ['public'];

            if (userEmail) {
                sql += ' OR uploadedBy = ?';
                params.push(userEmail);
            }

            this.db.all<SongRow>(sql, params, (err, rows) => {
                if (err) reject(err);
                console.log('Retrieved songs:', rows); // Debug log
                resolve(rows.map(convertSongRow));
            });
        });
    }

    async getSongsByFilter(filters: {
        mood?: string;
        year?: number;
        language?: string;
        tags?: string;
        userEmail?: string;
    }): Promise<Song[]> {
        return new Promise((resolve, reject) => {
            let sql =
                'SELECT * FROM songs WHERE (visibility = ? OR visibility IS NULL';
            const params: (string | number)[] = ['public'];

            if (filters.userEmail) {
                sql += ' OR uploadedBy = ?';
                params.push(filters.userEmail);
            }
            sql += ')';

            if (filters.mood) {
                sql += ' AND mood = ?';
                params.push(filters.mood);
            }
            if (filters.year) {
                sql += ' AND year = ?';
                params.push(filters.year);
            }
            if (filters.language) {
                sql += ' AND language = ?';
                params.push(filters.language);
            }
            if (filters.tags) {
                sql += ' AND tags LIKE ?';
                params.push(`%${filters.tags}%`);
            }

            this.db.all<SongRow>(sql, params, (err, rows) => {
                if (err) reject(err);
                resolve(rows.map(convertSongRow));
            });
        });
    }

    async getSongsByUploader(uploadedBy: string): Promise<Song[]> {
        return new Promise((resolve, reject) => {
            this.db.all<SongRow>(
                'SELECT * FROM songs WHERE uploadedBy = ?',
                [uploadedBy],
                (err, rows) => {
                    if (err) reject(err);
                    resolve(rows.map(convertSongRow));
                },
            );
        });
    }

    async updateSongVisibility(
        id: number,
        visibility: 'public' | 'private',
        uploaderEmail: string,
    ): Promise<boolean> {
        return new Promise((resolve, reject) => {
            this.db.run(
                'UPDATE songs SET visibility = ? WHERE id = ? AND uploadedBy = ?',
                [visibility, id, uploaderEmail],
                function (err: Error | null) {
                    if (err) reject(err);
                    resolve(this.changes > 0);
                },
            );
        });
    }

    async incrementPlayCount(id: number): Promise<void> {
        return new Promise((resolve, reject) => {
            this.db.run(
                'UPDATE songs SET playCount = playCount + 1 WHERE id = ?',
                [id],
                (err: Error | null) => {
                    if (err) reject(err);
                    resolve();
                },
            );
        });
    }

    async deleteSong(id: number, uploaderEmail: string): Promise<boolean> {
        return new Promise((resolve, reject) => {
            this.db.run(
                'DELETE FROM songs WHERE id = ? AND uploadedBy = ?',
                [id, uploaderEmail],
                function (err: Error | null) {
                    if (err) reject(err);
                    resolve(this.changes > 0);
                },
            );
        });
    }

    async searchSongs(query: string, userEmail?: string): Promise<Song[]> {
        return new Promise((resolve, reject) => {
            let sql = `SELECT * FROM songs WHERE (visibility = ? OR visibility IS NULL`;
            const params: string[] = ['public'];

            if (userEmail) {
                sql += ' OR uploadedBy = ?';
                params.push(userEmail);
            }
            sql +=
                ') AND (title LIKE ? OR artist LIKE ? OR mood LIKE ? OR tags LIKE ? OR lyrics LIKE ?)';
            const searchPattern = `%${query}%`;
            params.push(
                searchPattern,
                searchPattern,
                searchPattern,
                searchPattern,
                searchPattern,
            );

            this.db.all<SongRow>(sql, params, (err, rows) => {
                if (err) reject(err);
                resolve(rows.map(convertSongRow));
            });
        });
    }
}

// Determine database path based on environment
const isDev = process.env.NODE_ENV === 'development';
const DB_PATH = isDev
    ? path.join(process.cwd(), 'music.db')
    : '/app/database/music.db';

console.log('Using database path:', DB_PATH);

export const db = new DbClient({ filename: DB_PATH });
