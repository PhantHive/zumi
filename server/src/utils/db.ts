import sqlite3 from 'sqlite3';
import { Database } from 'sqlite3';
import { DatabaseConfig } from '../types/interfaces';
import { Song } from '../../../shared/types/common';

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
}

interface AlbumRow {
    albumId: string;
}

interface ArtistRow {
    artist: string;
}

// Convert SongRow to Song type
const convertSongRow = (
    row: SongRow,
): {
    duration: number;
    filepath: string;
    artist: string;
    genre: string;
    albumId: string;
    id: number;
    title: string;
    cover_art: string | undefined;
    thumbnailUrl: string | undefined;
} => ({
    id: row.id,
    title: row.title,
    artist: row.artist,
    duration: row.duration,
    filepath: row.filepath,
    albumId: row.albumId,
    thumbnailUrl: row.thumbnailUrl || undefined,
    cover_art: row.cover_art || undefined,
    genre: row.genre,
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
          genre TEXT CHECK(genre IN ('${GENRES.join("','")}')) NOT NULL DEFAULT 'K-Pop'
        )
      `);
        });
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

    async createSong(song: Partial<Song> & { genre?: Genre }): Promise<Song> {
        const sql = `
      INSERT INTO songs (title, artist, duration, filepath, albumId, thumbnailUrl, genre)
      VALUES (?, ?, ?, ?, ?, ?, ?)
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
                ],
                function (err: Error | null) {
                    if (err) reject(err);
                    db.getSongById(this.lastID)
                        .then((newSong) => {
                            if (!newSong)
                                throw new Error('Failed to create song');
                            resolve(newSong);
                        })
                        .catch(reject);
                },
            );
        });
    }

    async getAllSongs(): Promise<Song[]> {
        return new Promise((resolve, reject) => {
            this.db.all<SongRow>('SELECT * FROM songs', [], (err, rows) => {
                if (err) reject(err);
                console.log('Retrieved songs:', rows); // Debug log
                resolve(rows.map(convertSongRow));
            });
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
}

export const db = new DbClient({ filename: 'music.db' });
