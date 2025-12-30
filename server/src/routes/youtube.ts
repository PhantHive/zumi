import { Router, Request, Response, RequestHandler } from 'express';
import ytdl from '@distube/ytdl-core';
import yts from 'youtube-search-api';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';
import os from 'os';

const router = Router();

// Require auth middleware from parent router (server already wraps /api/youtube with auth)

// POST /api/youtube/search
const searchHandler: RequestHandler = async (req, res) => {
    try {
        const { query } = req.body;
        if (!query || typeof query !== 'string' || query.trim() === '') {
            res.status(400).json({ error: 'Query required' });
            return;
        }

        const results = await (yts as any).GetListByKeyword(query, false, 20);
        if (!results || !Array.isArray(results.items)) {
            res.json({ data: [] });
            return;
        }

        const formatted = results.items
            .filter((item: any) => item.type === 'video')
            .map((item: any) => {
                const thumbnails = item.thumbnail?.thumbnails || [];
                const bestThumb = thumbnails.length ? thumbnails[thumbnails.length - 1].url : item.thumbnail?.url || '';
                return {
                    videoId: item.id,
                    title: item.title,
                    channelName: item.channelTitle || item.author?.name || '',
                    thumbnail: bestThumb,
                    duration: item.length?.simpleText || item.lengthText || item.duration || '',
                    description: item.description || '',
                };
            });

        res.json({ data: formatted });
        return;
    } catch (error) {
        console.error('YouTube search error:', error);
        res.status(500).json({ error: 'Search failed' });
        return;
    }
};

// POST /api/youtube/download
const downloadHandler: RequestHandler = async (req, res) => {
    try {
        const { videoId } = req.body;
        if (!videoId || typeof videoId !== 'string') {
            res.status(400).json({ error: 'Video ID required' });
            return;
        }

        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
        const info = await (ytdl as any).getInfo(videoUrl);
        const videoDetails = info.videoDetails;

        const durationSeconds = parseInt(videoDetails.lengthSeconds || '0', 10);
        // Limit duration to 10 minutes
        if (durationSeconds > 600) {
            res.status(400).json({ error: 'Video too long (max 10 minutes)' });
            return;
        }

        const timestamp = Date.now();
        const tmpDir = os.tmpdir();
        const audioPath = path.join(tmpDir, `audio-${timestamp}.mp3`);
        const thumbnailPath = path.join(tmpDir, `thumb-${timestamp}.jpg`);

        // Download audio stream and convert to mp3 via ffmpeg
        const audioStream = (ytdl as any)(videoUrl, { quality: 'highestaudio', filter: 'audioonly' });

        await new Promise<void>((resolve, reject) => {
            (ffmpeg as any)(audioStream)
                .audioBitrate(128)
                .format('mp3')
                .on('error', (err: Error) => {
                    reject(err);
                })
                .on('end', () => resolve())
                .save(audioPath);
        });

        // Check max file size 50MB
        const stats = fs.statSync(audioPath);
        const maxSize = 50 * 1024 * 1024; // 50MB
        if (stats.size > maxSize) {
            try {
                fs.unlinkSync(audioPath);
            } catch (e) {
                /* ignore */
            }
            res.status(400).json({ error: 'Audio file too large (>50MB)' });
            return;
        }

        // Download thumbnail (best available)
        const thumbnails = Array.isArray(videoDetails.thumbnails) ? videoDetails.thumbnails : [];
        const thumbUrl = thumbnails.length ? thumbnails[thumbnails.length - 1].url : undefined;
        if (thumbUrl) {
            const response = await fetch(thumbUrl);
            if (!response.ok) {
                console.warn('Failed to download thumbnail:', response.statusText);
            } else {
                const buffer = Buffer.from(await response.arrayBuffer());
                await fs.promises.writeFile(thumbnailPath, buffer);
            }
        }

        // Return metadata and file paths
        res.json({
            audioPath,
            thumbnailPath: thumbUrl ? thumbnailPath : null,
            metadata: {
                title: videoDetails.title,
                artist: videoDetails.author?.name || videoDetails.ownerChannelName || '',
                duration: durationSeconds,
                description: videoDetails.description || '',
            },
        });
        return;
    } catch (error: any) {
        console.error('YouTube download error:', error);
        res.status(500).json({ error: 'Download failed', message: error?.message || String(error) });
        return;
    }
};

router.post('/search', searchHandler);
router.post('/download', downloadHandler);

export default router;
