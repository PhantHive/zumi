import sqlite3 from 'sqlite3';
import { Database } from 'sqlite3';
import { DatabaseConfig } from '../types/interfaces';
import { Song } from '../../../shared/types/common';

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
          cover_art TEXT
        )
      `);
    });
  }

  async createSong(song: Partial<Song>): Promise<Song> {
  const sql = `
    INSERT INTO songs (title, artist, filepath, albumId, thumbnailUrl)
    VALUES (?, ?, ?, ?, ?)
  `;

  return new Promise((resolve, reject) => {
    this.db.run(
      sql,
      [song.title, song.artist, song.filepath, song.albumId, song.thumbnailUrl || null],
      function(err: Error | null) {
        if (err) reject(err);

        // Fetch the created song to return complete data
        db.getSongById(this.lastID)
          .then(newSong => resolve(newSong as Song))
          .catch(reject);
      }
    );
  });
}

async getAllSongs(): Promise<Song[]> {
  return new Promise((resolve, reject) => {
    this.db.all('SELECT * FROM songs', [], (err, rows) => {
      if (err) reject(err);
      console.log('Retrieved songs:', rows); // Debug log
      resolve(rows as Song[]);
    });
  });
}

  async getSongById(id: number): Promise<Song | null> {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT * FROM songs WHERE id = ?', [id], (err, row) => {
        if (err) reject(err);
        resolve(row as Song || null);
      });
    });
  }

}

export const db = new DbClient({ filename: 'music.db' });