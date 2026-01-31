import { Request, RequestHandler } from 'express';
import { getAudioDurationInSeconds } from 'get-audio-duration';
import path from 'path';
import { db } from '../utils/db.js';
import { Song } from '../../../shared/types/common.js';
import * as fs from 'node:fs';
import { AuthenticatedRequest } from './authController.js';
import User from '../models/User.js';
import ffmpeg from 'fluent-ffmpeg';

type MulterRequest = Request & {
    files?: {
        [fieldname: string]: Express.Multer.File[];
    };
};

// Helper: run ffprobe and return metadata.tags (or empty object)
async function probeTags(filePath: string): Promise<Record<string, any>> {
    return new Promise((resolve) => {
        try {
            // fluent-ffmpeg's ffprobe callback
            (ffmpeg as any).ffprobe(filePath, (err: any, metadata: any) => {
                if (err) {
                    console.warn('ffprobe failed to read tags:', err && err.message ? err.message : err);
                    resolve({});
                    return;
                }
                const tags = (metadata && (metadata.format && metadata.format.tags)) || {};
                resolve(tags);
            });
        } catch (e) {
            console.warn('ffprobe exception:', e);
            resolve({});
        }
    });
}

// Normalize common tag keys across formats
function extractTagValue(tags: Record<string, any>, keys: string[]): string | undefined {
    for (const key of keys) {
        if (!tags) continue;
        const val = tags[key];
        if (typeof val === 'string' && val.trim().length) return val.trim();
        // some tag values may be arrays
        if (Array.isArray(val) && val.length && typeof val[0] === 'string') return val[0].trim();
    }
    return undefined;
}

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
            const songId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
            const song = await db.getSongById(parseInt(songId));

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
            const baseVideoPath = isDev
                ? './public/uploads/videos'
                : '/app/uploads/videos'; // NEW: Video base path

            // Ensure directories exist
            await fs.promises.mkdir(baseMusicPath, { recursive: true });
            await fs.promises.mkdir(baseThumbnailPath, { recursive: true });
            await fs.promises.mkdir(baseVideoPath, { recursive: true }); // NEW: Create video directory

            const duration = await getAudioDurationInSeconds(audioFile.path);
            console.log('Audio duration:', duration);

            // Try to read metadata tags from the audio file and use them to fill missing fields
            const metadataTags = await probeTags(audioFile.path);
            const tagTitle = extractTagValue(metadataTags, ['title', 'TITLE', 'TIT2', '\u00A9nam', 'name']);
            const tagArtist = extractTagValue(metadataTags, ['artist', 'ARTIST', 'TPE1', '\u00A9ART', 'album_artist']);
            const tagAlbum = extractTagValue(metadataTags, ['album', 'ALBUM', 'TALB', '\u00A9alb']);
            const tagYear = extractTagValue(metadataTags, ['date', 'YEAR', 'TYER', 'year']);
            const tagGenre = extractTagValue(metadataTags, ['genre', 'GENRE', 'TCON']);
            const tagBpm = extractTagValue(metadataTags, ['TBPM', 'bpm', 'BPM']);
            const tagLyrics = extractTagValue(metadataTags, ['lyrics', 'LYRICS', 'unsynchronised_lyric', 'comment']);

            let thumbnailUrl: string | undefined = undefined;
            if (multerReq.files?.['thumbnail']?.[0]) {
                const thumbnail = multerReq.files['thumbnail'][0];
                thumbnailUrl = `${thumbnail.filename}`;
            }

            // NEW: Handle video upload
            let videoUrl: string | undefined = undefined;
            if (multerReq.files?.['video']?.[0]) {
                const video = multerReq.files['video'][0];
                videoUrl = `${video.filename}`;
                console.log('Video uploaded:', videoUrl);
            }

            // Parse tags if provided as comma-separated string
            const tags = req.body.tags
                ? req.body.tags.split(',').map((t: string) => t.trim())
                : undefined;

            const song: Partial<Song> = {
                title:
                    req.body.title || tagTitle || path.parse(audioFile.originalname).name,
                artist: req.body.artist || tagArtist || 'Unknown Artist',
                duration: Math.floor(duration),
                albumId: req.body.album || tagAlbum || 'Unknown Album',
                filepath: path.join(baseMusicPath, audioFile.filename),
                thumbnailUrl: thumbnailUrl || 'placeholder.png',
                videoUrl, // NEW: Include video URL
                uploadedBy: userEmail,
                visibility: req.body.visibility || 'public',
                year: req.body.year ? parseInt(req.body.year) : tagYear ? parseInt(tagYear) : undefined,
                bpm: req.body.bpm ? parseInt(req.body.bpm) : tagBpm ? parseInt(tagBpm) : undefined,
                mood: req.body.mood,
                language: req.body.language,
                lyrics: req.body.lyrics || tagLyrics,
                tags,
            };

            const newSong = await db.createSong({
                ...song,
                genre: req.body.genre ? String(req.body.genre) : tagGenre ? String(tagGenre) : undefined,
            });
            res.status(201).json({ data: newSong });
        } catch (error) {
            console.error('Error creating song:', error);
            res.status(500).json({ error: 'Failed to create song' });
        }
    };

    streamSong: RequestHandler = async (req, res) => {
        try {
            const authenticatedReq = req as AuthenticatedRequest;
            const userEmail = authenticatedReq.user?.email;
            const songId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
            const song = await db.getSongById(parseInt(songId));

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

    // NEW: Stream video endpoint
    streamVideo: RequestHandler = async (req, res) => {
        try {
            const authenticatedReq = req as AuthenticatedRequest;
            const userEmail = authenticatedReq.user?.email;
            const songId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
            const song = await db.getSongById(parseInt(songId));

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

            if (!song.videoUrl) {
                res.status(404).json({ error: 'No video available for this song' });
                return;
            }

            // Construct full video path
            const isDev = process.env.NODE_ENV === 'development';
            const baseVideoPath = isDev
                ? './public/uploads/videos'
                : '/app/uploads/videos';
            const videoPath = path.join(baseVideoPath, song.videoUrl);

            if (!fs.existsSync(videoPath)) {
                res.status(404).json({ error: 'Video file not found' });
                return;
            }

            // Get file stats for range support
            const stat = fs.statSync(videoPath);
            const fileSize = stat.size;
            const range = req.headers.range;

            if (range) {
                // Parse range header
                const parts = range.replace(/bytes=/, '').split('-');
                const start = parseInt(parts[0], 10);
                const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
                const chunksize = end - start + 1;

                // Create read stream for the requested range
                const file = fs.createReadStream(videoPath, { start, end });

                // Set response headers for partial content
                res.writeHead(206, {
                    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': chunksize,
                    'Content-Type': 'video/mp4',
                });

                file.pipe(res);
            } else {
                // Send entire file if no range requested
                res.writeHead(200, {
                    'Content-Length': fileSize,
                    'Content-Type': 'video/mp4',
                });
                fs.createReadStream(videoPath).pipe(res);
            }
        } catch (error: unknown) {
            if (error instanceof Error) {
                console.error('Error streaming video:', error);
            }
            res.status(500).json({ error: 'Failed to stream video' });
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
            const songIdParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
            const songId = parseInt(songIdParam);
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
            const songIdParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
            const songId = parseInt(songIdParam);
            const multerReq = req as MulterRequest;

            const isDev = process.env.NODE_ENV === 'development';
            const baseMusicPath = isDev ? './public/data' : '/app/data';

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

                // If audio is replaced, try to read metadata and fill missing fields
                const metadataTags = await probeTags(audioFile.path);
                const tagTitle = extractTagValue(metadataTags, ['title', 'TITLE', 'TIT2', '\u00A9nam', 'name']);
                const tagArtist = extractTagValue(metadataTags, ['artist', 'ARTIST', 'TPE1', '\u00A9ART', 'album_artist']);
                const tagAlbum = extractTagValue(metadataTags, ['album', 'ALBUM', 'TALB', '\u00A9alb']);
                const tagYear = extractTagValue(metadataTags, ['date', 'YEAR', 'TYER', 'year']);
                const tagGenre = extractTagValue(metadataTags, ['genre', 'GENRE', 'TCON']);
                const tagBpm = extractTagValue(metadataTags, ['TBPM', 'bpm', 'BPM']);
                const tagLyrics = extractTagValue(metadataTags, ['lyrics', 'LYRICS', 'unsynchronised_lyric', 'comment']);

                if (!req.body.title && tagTitle) updates.title = tagTitle;
                if (!req.body.artist && tagArtist) updates.artist = tagArtist;
                if (!req.body.album && tagAlbum) updates.albumId = tagAlbum;
                if (!req.body.year && tagYear) updates.year = parseInt(tagYear);
                if (!req.body.bpm && tagBpm) updates.bpm = parseInt(tagBpm);
                if (!req.body.lyrics && tagLyrics) updates.lyrics = tagLyrics;
                if (!req.body.genre && tagGenre) updates.genre = tagGenre;
            }

            // Handle optional thumbnail replacement
            const thumbnail = multerReq.files?.['thumbnail']?.[0];
            if (thumbnail) {
                updates.thumbnailUrl = `${thumbnail.filename}`;
            }

            // NEW: Handle optional video replacement
            const video = multerReq.files?.['video']?.[0];
            if (video) {
                updates.videoUrl = `${video.filename}`;
                console.log('Video updated:', updates.videoUrl);
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
            const songIdParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
            const songId = parseInt(songIdParam);

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

    // Simple administrative delete: remove song row by id regardless of uploader
    deleteSongRow: RequestHandler = async (req, res) => {
        try {
            const songIdParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
            const songId = parseInt(songIdParam);
            if (Number.isNaN(songId)) {
                res.status(400).json({ error: 'Invalid song id' });
                return;
            }

            const success = await db.deleteSongById(songId);
            if (!success) {
                res.status(404).json({ error: 'Song not found' });
                return;
            }

            res.json({ message: 'Song row deleted successfully' });
        } catch (error: unknown) {
            if (error instanceof Error) console.error('Error in deleteSongRow:', error);
            res.status(500).json({ error: 'Failed to delete song row' });
        }
    };

    toggleLike: RequestHandler = async (req, res) => {
        try {
            const authenticatedReq = req as AuthenticatedRequest;
            const userId = authenticatedReq.user.id;
            const songIdParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
            const songId = parseInt(songIdParam);

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

    // Return top genres for recommendation
    getTopGenres: RequestHandler = async (req, res) => {
        try {
            const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 10;
            const data = await db.getTopGenres(isNaN(limit) ? 10 : limit);
            res.json({ data });
        } catch (error: unknown) {
            if (error instanceof Error) console.error('Error fetching top genres:', error);
            res.status(500).json({ error: 'Failed to fetch genres' });
        }
    };

    getGenres: RequestHandler = async (_req, res) => {
        try {
            const genres = await db.getUniqueGenres();
            res.json({ data: genres });
        } catch (error: unknown) {
            if (error instanceof Error) {
                console.error('Error fetching genres:', error);
            }
            res.status(500).json({ error: 'Internal server error' });
        }
    };
}

export const songController = new SongController();

