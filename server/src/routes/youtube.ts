import { Router, Request, Response, RequestHandler } from 'express';
import ytdl from '@distube/ytdl-core';
import yts from 'youtube-search-api';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import puppeteer from 'puppeteer';

const execFile = promisify(execFileCb);

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

// Puppeteer fallback: try to get a direct audio URL by evaluating the page's player response.
async function puppeteerFallback(videoUrl: string, timestamp: number, tmpDir: string) {
    const browser = await puppeteer.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        headless: true,
    });
    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.goto(videoUrl, { waitUntil: 'networkidle2', timeout: 30000 });

        const playerResp = await page.evaluate(() => {
            // @ts-ignore
            try {
                // Modern YouTube exposes this
                // @ts-ignore
                if (typeof window !== 'undefined' && (window as any).ytInitialPlayerResponse) return (window as any).ytInitialPlayerResponse;
                // @ts-ignore
                if ((window as any).ytplayer && (window as any).ytplayer.config && (window as any).ytplayer.config.args && (window as any).ytplayer.config.args.player_response) {
                    return JSON.parse((window as any).ytplayer.config.args.player_response);
                }
            } catch (e) {
                return null;
            }
            return null;
        });

        if (!playerResp || !playerResp.streamingData) {
            return null;
        }

        const formats = playerResp.streamingData.adaptiveFormats || [];
        // prefer audio mime formats with direct url
        const audioFormats = formats.filter((f: any) => f.mimeType && /audio\//.test(f.mimeType));
        const withUrl = audioFormats.find((f: any) => f.url) || audioFormats[0];
        if (!withUrl || !withUrl.url) {
            // cannot extract direct URL without signature deciphering
            return null;
        }

        const audioUrl = withUrl.url as string;

        const audioPath = path.join(tmpDir, `audio-${timestamp}.mp3`);

        // Use ffmpeg to convert remote audio stream to mp3
        await new Promise<void>((resolve, reject) => {
            try {
                (ffmpeg as any)(audioUrl)
                    .audioBitrate(128)
                    .format('mp3')
                    .on('error', (err: Error) => reject(err))
                    .on('end', () => resolve())
                    .save(audioPath);
            } catch (e) {
                reject(e as Error);
            }
        });

        // find thumbnail if available
        let thumbnailPath: string | null = null;
        const thumbs = playerResp.videoDetails?.thumbnail?.thumbnails || playerResp.microformat?.playerMicroformatRenderer?.thumbnail?.thumbnails || [];
        if (Array.isArray(thumbs) && thumbs.length) {
            const thumbUrl = thumbs[thumbs.length - 1].url;
            try {
                const resp = await page.goto(thumbUrl, { timeout: 15000 });
                if (resp && resp.buffer) {
                    const buffer = await resp.buffer();
                    thumbnailPath = path.join(tmpDir, `thumb-${timestamp}.jpg`);
                    await fs.promises.writeFile(thumbnailPath, buffer);
                }
            } catch (e) {
                // ignore thumbnail errors
            }
        }

        return { info: playerResp, audioPath, thumbnailPath };
    } finally {
        try { await browser.close(); } catch (e) { /* ignore */ }
    }
}

async function ytDlpFallback(videoUrl: string, timestamp: number, tmpDir: string) {
    // Use yt-dlp CLI to fetch metadata and extract audio + thumbnail
    const jsonCmd = ['-j', videoUrl];
    try {
        const { stdout } = await execFile('yt-dlp', jsonCmd, { maxBuffer: 10 * 1024 * 1024 });
        const info = JSON.parse(stdout as string);

        const audioTemplate = path.join(tmpDir, `audio-${timestamp}.%(ext)s`);
        const args = [
            '-x',
            '--audio-format',
            'mp3',
            '--no-post-overwrites',
            '--embed-thumbnail',
            '--add-metadata',
            '-o',
            audioTemplate,
            videoUrl,
        ];

        await execFile('yt-dlp', args, { maxBuffer: 50 * 1024 * 1024 });

        // Find produced audio file and thumbnail
        const possibleAudio = path.join(tmpDir, `audio-${timestamp}.mp3`);
        let audioPath = fs.existsSync(possibleAudio) ? possibleAudio : null;

        const thumbExts = ['jpg', 'jpeg', 'png', 'webp', 'webm'];
        let thumbnailPath: string | null = null;
        for (const ext of thumbExts) {
            const p = path.join(tmpDir, `audio-${timestamp}.${ext}`);
            if (fs.existsSync(p)) {
                thumbnailPath = p;
                break;
            }
        }

        return {
            info,
            audioPath,
            thumbnailPath,
        };
    } catch (err: any) {
        throw err;
    }
}

// POST /api/youtube/download
const downloadHandler: RequestHandler = async (req, res) => {
    try {
        const { videoId } = req.body;
        // try puppeteer fallback before asking for cookies-based yt-dlp
        const tryPuppeteerFirst = true;
        if (!videoId || typeof videoId !== 'string') {
            res.status(400).json({ error: 'Video ID required' });
            return;
        }

        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

        // Try ytdl first
        let info: any;
        try {
            info = await (ytdl as any).getInfo(videoUrl);
        } catch (err: any) {
            const msg = String(err?.message || err);
            // Detect YouTube "sign in to confirm" / consent blocks
            if (/sign in to confirm|bot|captcha|login required|verify/i.test(msg)) {
                console.warn('ytdl-core blocked, attempting puppeteer then yt-dlp fallback:', msg);
                const timestamp = Date.now();
                const tmpDir = os.tmpdir();
                if (tryPuppeteerFirst) {
                    try {
                        const pResult = await puppeteerFallback(videoUrl, timestamp, tmpDir);
                        if (pResult && pResult.audioPath) {
                            const videoDetails = pResult.info;
                            const durationSeconds = parseInt(videoDetails?.videoDetails?.lengthSeconds || videoDetails?.length || '0', 10) || 0;
                            res.json({
                                audioPath: pResult.audioPath,
                                thumbnailPath: pResult.thumbnailPath || null,
                                metadata: {
                                    title: videoDetails?.videoDetails?.title || videoDetails?.title || '',
                                    artist: videoDetails?.videoDetails?.author?.name || videoDetails?.uploader || '',
                                    duration: durationSeconds,
                                    description: videoDetails?.videoDetails?.shortDescription || videoDetails?.description || '',
                                },
                            });
                            return;
                        }
                    } catch (puErr: any) {
                        console.warn('puppeteer fallback failed (will try yt-dlp):', puErr?.message || puErr);
                        // fall through to yt-dlp fallback
                    }
                }
                try {
                    const result = await ytDlpFallback(videoUrl, timestamp, tmpDir);
                    const videoDetails = result.info;
                    const durationSeconds = parseInt(videoDetails.duration || videoDetails.duration_seconds || '0', 10) || (videoDetails.duration ? Math.floor(videoDetails.duration) : 0);

                    // Check file size if audioPath exists
                    if (result.audioPath) {
                        const stats = fs.statSync(result.audioPath);
                        const maxSize = 50 * 1024 * 1024; // 50MB
                        if (stats.size > maxSize) {
                            try { fs.unlinkSync(result.audioPath); } catch (e) { /* ignore */ }
                            res.status(400).json({ error: 'Audio file too large (>50MB)' });
                            return;
                        }
                    }

                    res.json({
                        audioPath: result.audioPath,
                        thumbnailPath: result.thumbnailPath,
                        metadata: {
                            title: videoDetails.title || videoDetails.fulltitle || '',
                            artist: videoDetails.uploader || videoDetails.channel || '',
                            duration: durationSeconds,
                            description: videoDetails.description || videoDetails.full_description || '',
                        },
                    });
                    return;
                } catch (fallbackErr: any) {
                    console.error('yt-dlp fallback failed:', fallbackErr);
                    res.status(500).json({ error: 'Download failed', message: 'ytdl blocked and yt-dlp fallback failed: ' + String(fallbackErr?.message || fallbackErr) });
                    return;
                }
            }
            // Other errors from ytdl
            throw err;
        }

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
