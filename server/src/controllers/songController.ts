import { Request, RequestHandler } from 'express';
import { getAudioDurationInSeconds } from 'get-audio-duration';
import path from 'path';
import { db } from '../utils/db.js';
import { Song, Genre } from '../../../shared/types/common.js';
import * as fs from 'node:fs';
import { AuthenticatedRequest } from './authController.js';
import User from '../models/User.js';
import os from 'os';
import fetch from 'node-fetch';

type MulterRequest = Request & {
    files?: {
        [fieldname: string]: Express.Multer.File[];
    };
};

export class SongController {
    getAllSongs: RequestHandler = async (req, res) => {
        try {
            const authenticatedReq = req as AuthenticatedRequest;
            const userEmail = authenticatedReq.user?.email;

            // Check for filters
            const { mood, year, language, tags, search, sortBy } = req.query;

            let songs: Song[];

            if (search) {
                songs = await db.searchSongs(search as string, userEmail);
            } else if (mood || year || language || tags) {
                songs = await db.getSongsByFilter({
                    mood: mood as string,
                    year: year ? parseInt(year as string) : undefined,
                    language: language as string,
                    tags: tags as string,
                    userEmail,
                });
            } else {
                songs = await db.getAllSongs(userEmail);
            }

            // Apply sorting
            if (sortBy === 'playCount') {
                songs.sort((a, b) => (b.playCount || 0) - (a.playCount || 0));
            } else if (sortBy === 'year') {
                songs.sort((a, b) => (b.year || 0) - (a.year || 0));
            } else if (sortBy === 'recent') {
                songs.sort((a, b) => b.id - a.id);
            }

            res.json({ data: songs });
        } catch (error: unknown) {
            if (error instanceof Error) {
                console.error('Error fetching songs:', error);
            }
            res.status(500).json({ error: 'Failed to fetch songs' });
        }
    };

    getArtists: RequestHandler = async (_req, res) => {
        try {
            console.log('Fetching artists - Request received');
            const artists = await db.getUniqueArtists();
            console.log('Artists found:', artists);
            res.json({ data: artists });
        } catch (error: unknown) {
            if (error instanceof Error) {
                console.error('Error in getArtists:', error);
            }
            console.error('Error in getArtists:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    };

    getAlbums: RequestHandler = async (_req, res) => {
        try {
            const albums = await db.getUniqueAlbums();
            res.json({ data: albums });
        } catch (error: unknown) {
            if (error instanceof Error) {
                console.error('Error fetching albums:', error);
            }
            console.error('Error fetching albums:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    };

    getSong: RequestHandler = async (req, res) => {
        try {
            const authenticatedReq = req as AuthenticatedRequest;
            const userEmail = authenticatedReq.user?.email;
            const song = await db.getSongById(parseInt(req.params.id));

            if (!song) {
                res.status(404).json({ error: 'Song not found' });
                return;
            }

            // Check visibility permissions
            if (
                song.visibility === 'private' &&
                song.uploadedBy !== userEmail
            ) {
                res.status(403).json({
                    error: 'Access denied to private song',
                });
                return;
            }

            res.json({ data: song });
        } catch (error: unknown) {
            if (error instanceof Error) {
                console.error('Error fetching song:', error);
            }
            res.status(500).json({ error: 'Failed to fetch song' });
        }
    };

    createSong: RequestHandler = async (req, res) => {
        try {
            const authenticatedReq = req as AuthenticatedRequest;
            const userEmail = authenticatedReq.user.email;
            const multerReq = req as MulterRequest;
            const audioFile = multerReq.files?.['audio']?.[0];
            if (!audioFile) {
                res.status(400).json({ error: 'No audio file provided' });
                return;
            }

            const isDev = process.env.NODE_ENV === 'development';
            const baseMusicPath = isDev ? './public/data' : '/app/data';
            const baseThumbnailPath = isDev
                ? './public/uploads/thumbnails'
                : '/app/uploads/thumbnails';

            // Ensure directories exist
            await fs.promises.mkdir(baseMusicPath, { recursive: true });
            await fs.promises.mkdir(baseThumbnailPath, { recursive: true });

            const duration = await getAudioDurationInSeconds(audioFile.path);
            console.log('Audio duration:', duration);

            let thumbnailUrl: string | undefined = undefined;
            if (multerReq.files?.['thumbnail']?.[0]) {
                const thumbnail = multerReq.files['thumbnail'][0];
                // Use the existing path for the thumbnail
                const publicThumbnailPath = path.join(
                    baseThumbnailPath,
                    thumbnail.filename,
                );
                console.log('Public thumbnail path:', publicThumbnailPath); // Debug log
                thumbnailUrl = `${thumbnail.filename}`;
            }

            // Parse tags if provided as comma-separated string
            const tags = req.body.tags
                ? req.body.tags.split(',').map((t: string) => t.trim())
                : undefined;

            const song: Partial<Song> = {
                title:
                    req.body.title || path.parse(audioFile.originalname).name,
                artist: req.body.artist || 'Unknown Artist',
                duration: Math.floor(duration),
                albumId: req.body.album || 'Unknown Album',
                filepath: path.join(baseMusicPath, audioFile.filename),
                thumbnailUrl: thumbnailUrl || 'placeholder.jpg',
                uploadedBy: userEmail,
                visibility: req.body.visibility || 'public',
                year: req.body.year ? parseInt(req.body.year) : undefined,
                bpm: req.body.bpm ? parseInt(req.body.bpm) : undefined,
                mood: req.body.mood,
                language: req.body.language,
                lyrics: req.body.lyrics,
                tags,
            };

            const newSong = await db.createSong({
                ...song,
                genre: (req.body.genre as Genre) || undefined,
            });
            res.status(201).json({ data: newSong });
        } catch (error) {
            console.error('Error creating song:', error);
            res.status(500).json({ error: 'Failed to create song' });
        }
    };

    // Import a song by referencing server-side or remote URLs (used by mobile client)
    importSong: RequestHandler = async (req, res) => {
        try {
            const authenticatedReq = req as AuthenticatedRequest;
            const userEmail = authenticatedReq.user.email;

            const isDev = process.env.NODE_ENV === 'development';
            const baseMusicPath = isDev ? path.resolve('./public/data') : '/app/data';
            const baseThumbnailPath = isDev
                ? path.resolve('./public/uploads/thumbnails')
                : '/app/uploads/thumbnails';

            await fs.promises.mkdir(baseMusicPath, { recursive: true });
            await fs.promises.mkdir(baseThumbnailPath, { recursive: true });

            const { audioPath, thumbnailPath } = req.body as { audioPath?: string; thumbnailPath?: string };

            if (!audioPath) {
                res.status(400).json({ error: 'audioPath required' });
                return;
            }

            // Helper to move a temp file into permanent storage; if not present, try downloading
            const moveOrDownload = async (fileUrl: string, destDir: string, prefix: string) => {
                const basename = path.basename(fileUrl);
                const tmpFile = path.join(os.tmpdir(), basename);
                const ext = path.extname(basename) || '.bin';
                const newName = `${Date.now()}-${Math.random().toString(36).slice(2,8)}${ext}`;
                const destPath = path.join(destDir, newName);

                if (fs.existsSync(tmpFile)) {
                    await fs.promises.rename(tmpFile, destPath);
                    return { filename: newName, fullpath: destPath };
                }

                // Try fetching via HTTP
                try {
                    const fullUrl = fileUrl.startsWith('/') ? `${process.env.SERVER_PUBLIC_URL || ''}${fileUrl}` : fileUrl;
                    const resp = await fetch(fullUrl);
                    if (!resp.ok) throw new Error(`Failed to download ${fullUrl}: ${resp.status}`);
                    const buffer = Buffer.from(await resp.arrayBuffer());
                    await fs.promises.writeFile(destPath, buffer);
                    return { filename: newName, fullpath: destPath };
                } catch (e: any) {
                    throw new Error('Failed to move or download file: ' + (e?.message || e));
                }
            };

            // Move audio
            let audioResult;
            try {
                audioResult = await moveOrDownload(audioPath, baseMusicPath, 'audio');
            } catch (e: any) {
                console.error('Audio import failed:', e);
                res.status(500).json({ error: 'Audio import failed' });
                return;
            }

            // Move thumbnail (optional)
            let thumbnailFilename: string | undefined = undefined;
            if (thumbnailPath) {
                try {
                    const thumbResult = await moveOrDownload(thumbnailPath, baseThumbnailPath, 'thumb');
                    thumbnailFilename = thumbResult.filename;
                } catch (e: any) {
                    console.warn('Thumbnail import failed, continuing without thumbnail:', e?.message || e);
                }
            }

            // Determine duration (best effort) using the temp file path we just moved
            let duration = 0;
            try {
                duration = Math.floor(await getAudioDurationInSeconds(audioResult.fullpath));
            } catch (e) {
                console.warn('Failed to read audio duration:', e);
            }

            const tags = req.body.tags
                ? (req.body.tags as string).split(',').map((t: string) => t.trim())
                : undefined;

            const song: Partial<Song> = {
                title: req.body.title || path.parse(audioResult.filename).name,
                artist: req.body.artist || 'Unknown Artist',
                duration: duration || 0,
                albumId: req.body.album || 'Unknown Album',
                filepath: path.join(baseMusicPath, audioResult.filename),
                thumbnailUrl: thumbnailFilename || 'placeholder.jpg',
                uploadedBy: userEmail,
                visibility: req.body.visibility || 'public',
                year: req.body.year ? parseInt(req.body.year) : undefined,
                bpm: req.body.bpm ? parseInt(req.body.bpm) : undefined,
                mood: req.body.mood,
                language: req.body.language,
                lyrics: req.body.lyrics,
                tags,
            };

            const newSong = await db.createSong({
                ...song,
                genre: (req.body.genre as Genre) || undefined,
            });

            res.status(201).json({ data: newSong });
            return;
        } catch (error) {
            console.error('Error importing song:', error);
            res.status(500).json({ error: 'Failed to import song' });
            return;
        }
    };

    streamSong: RequestHandler = async (req, res) => {
        try {
            const authenticatedReq = req as AuthenticatedRequest;
            const userEmail = authenticatedReq.user?.email;
            const song = await db.getSongById(parseInt(req.params.id));

            if (!song) {
                res.status(404).json({ error: 'Song not found' });
                return;
            }

            // Check visibility permissions
            if (
                song.visibility === 'private' &&
                song.uploadedBy !== userEmail
            ) {
                res.status(403).json({
                    error: 'Access denied to private song',
                });
                return;
            }

            // Increment play count
            await db.incrementPlayCount(song.id);

            res.sendFile(path.resolve(song.filepath));
        } catch (error: unknown) {
            if (error instanceof Error) {
                console.error('Error streaming song:', error);
            }
            res.status(500).json({ error: 'Failed to stream song' });
        }
    };

    getMyUploads: RequestHandler = async (req, res) => {
        try {
            const authenticatedReq = req as AuthenticatedRequest;
            const userEmail = authenticatedReq.user.email;
            const songs = await db.getSongsByUploader(userEmail);
            res.json({ data: songs });
        } catch (error: unknown) {
            if (error instanceof Error) {
                console.error('Error fetching uploads:', error);
            }
            res.status(500).json({ error: 'Failed to fetch uploads' });
        }
    };

    updateVisibility: RequestHandler = async (req, res) => {
        try {
            const authenticatedReq = req as AuthenticatedRequest;
            const userEmail = authenticatedReq.user.email;
            const songId = parseInt(req.params.id);
            const { visibility } = req.body;

            if (!visibility || !['public', 'private'].includes(visibility)) {
                res.status(400).json({ error: 'Invalid visibility value' });
                return;
            }

            const success = await db.updateSongVisibility(
                songId,
                visibility,
                userEmail,
            );

            if (!success) {
                res.status(404).json({
                    error: 'Song not found or unauthorized',
                });
                return;
            }

            res.json({ message: 'Visibility updated successfully' });
        } catch (error: unknown) {
            if (error instanceof Error) {
                console.error('Error updating visibility:', error);
            }
            res.status(500).json({ error: 'Failed to update visibility' });
        }
    };

    updateSong: RequestHandler = async (req, res) => {
        try {
            const authenticatedReq = req as AuthenticatedRequest;
            const userEmail = authenticatedReq.user.email;
            const songId = parseInt(req.params.id);
            const multerReq = req as MulterRequest;

            const isDev = process.env.NODE_ENV === 'development';
            const baseMusicPath = isDev ? './public/data' : '/app/data';
            const baseThumbnailPath = isDev
                ? './public/uploads/thumbnails'
                : '/app/uploads/thumbnails';

            const updates: any = {};

            // Handle optional audio replacement
            const audioFile = multerReq.files?.['audio']?.[0];
            if (audioFile) {
                // audioFile.path already uses the configured storage destination
                updates.filepath = path.join(baseMusicPath, audioFile.filename);
                try {
                    const duration = await getAudioDurationInSeconds(audioFile.path);
                    updates.duration = Math.floor(duration);
                } catch (e) {
                    console.warn('Failed to determine audio duration:', e);
                }
            }

            // Handle optional thumbnail replacement
            const thumbnail = multerReq.files?.['thumbnail']?.[0];
            if (thumbnail) {
                updates.thumbnailUrl = `${thumbnail.filename}`;
            }

            // Metadata fields
            if (req.body.title) updates.title = req.body.title;
            if (req.body.artist) updates.artist = req.body.artist;
            if (req.body.album) updates.albumId = req.body.album;
            if (req.body.visibility) updates.visibility = req.body.visibility;
            if (req.body.year) updates.year = parseInt(req.body.year);
            if (req.body.bpm) updates.bpm = parseInt(req.body.bpm);
            if (req.body.mood) updates.mood = req.body.mood;
            if (req.body.language) updates.language = req.body.language;
            if (req.body.lyrics) updates.lyrics = req.body.lyrics;
            if (req.body.genre) updates.genre = req.body.genre;
            if (req.body.tags) updates.tags = req.body.tags
                .split(',')
                .map((t: string) => t.trim())
                .filter(Boolean);

            const updated = await db.updateSong(songId, updates, userEmail);
            if (!updated) {
                res.status(404).json({ error: 'Song not found or unauthorized' });
                return;
            }

            res.json({ data: updated });
        } catch (error) {
            console.error('Error updating song:', error);
            res.status(500).json({ error: 'Failed to update song' });
        }
    };

    deleteSong: RequestHandler = async (req, res) => {
        try {
            const authenticatedReq = req as AuthenticatedRequest;
            const userEmail = authenticatedReq.user.email;
            const songId = parseInt(req.params.id);

            const success = await db.deleteSong(songId, userEmail);

            if (!success) {
                res.status(404).json({
                    error: 'Song not found or unauthorized',
                });
                return;
            }

            res.json({ message: 'Song deleted successfully' });
        } catch (error: unknown) {
            if (error instanceof Error) {
                console.error('Error deleting song:', error);
            }
            res.status(500).json({ error: 'Failed to delete song' });
        }
    };

    toggleLike: RequestHandler = async (req, res) => {
        try {
            const authenticatedReq = req as AuthenticatedRequest;
            const userId = authenticatedReq.user.id;
            const songId = parseInt(req.params.id);

            // Verify song exists and user has access
            const userEmail = authenticatedReq.user.email;
            const song = await db.getSongById(songId);

            if (!song) {
                res.status(404).json({ error: 'Song not found' });
                return;
            }

            if (
                song.visibility === 'private' &&
                song.uploadedBy !== userEmail
            ) {
                res.status(403).json({ error: 'Access denied' });
                return;
            }

            const user = await User.findById(userId);
            if (!user) {
                res.status(404).json({ error: 'User not found' });
                return;
            }

            const likedIndex = user.likedSongs.indexOf(songId);
            if (likedIndex > -1) {
                // Unlike
                user.likedSongs.splice(likedIndex, 1);
            } else {
                // Like
                user.likedSongs.push(songId);
            }

            await user.save();

            res.json({
                liked: likedIndex === -1,
                likedSongs: user.likedSongs,
            });
        } catch (error: unknown) {
            if (error instanceof Error) {
                console.error('Error toggling like:', error);
            }
            res.status(500).json({ error: 'Failed to toggle like' });
        }
    };

    getLikedSongs: RequestHandler = async (req, res) => {
        try {
            const authenticatedReq = req as AuthenticatedRequest;
            const userId = authenticatedReq.user.id;

            const user = await User.findById(userId);
            if (!user) {
                res.status(404).json({ error: 'User not found' });
                return;
            }

            // Fetch all liked songs
            const likedSongs: Song[] = [];
            for (const songId of user.likedSongs) {
                const song = await db.getSongById(songId);
                if (
                    song &&
                    (song.visibility === 'public' ||
                        song.uploadedBy === user.email)
                ) {
                    likedSongs.push(song);
                }
            }

            res.json({ data: likedSongs });
        } catch (error: unknown) {
            if (error instanceof Error) {
                console.error('Error fetching liked songs:', error);
            }
            res.status(500).json({ error: 'Failed to fetch liked songs' });
        }
    };
}

export const songController = new SongController();
