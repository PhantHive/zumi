import { Router, Request, Response } from 'express';
import yts from 'youtube-search-api';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile as execFileCb } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const router = Router();

// Determine project root and permanent storage paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const isDev = process.env.NODE_ENV === 'development';
const PERM_AUDIO_DIR = isDev ? path.join(PROJECT_ROOT, 'public', 'data') : '/app/data';
const PERM_THUMB_DIR = isDev ? path.join(PROJECT_ROOT, 'public', 'uploads', 'thumbnails') : '/app/uploads/thumbnails';

// Ensure permanent directories exist
try {
    fs.mkdirSync(PERM_AUDIO_DIR, { recursive: true });
    fs.mkdirSync(PERM_THUMB_DIR, { recursive: true });
} catch (e) {
    console.warn('Failed to ensure permanent storage dirs:', e);
}

// Simple in-memory job store for async downloads
type JobStatus = 'pending' | 'done' | 'failed';
interface Job {
    id: string;
    status: JobStatus;
    createdAt: number;
    updatedAt: number;
    result?: any;
    error?: string;
}
const jobs = new Map<string, Job>();

// Promisify execFile
function runExecFile(command: string, args: string[], options: any = {}): Promise<{ stdout: string; stderr: string; }> {
    return new Promise((resolve, reject) => {
        execFileCb(command, args, options, (err, stdout, stderr) => {
            if (err) {
                (err as any).stdout = stdout;
                (err as any).stderr = stderr;
                return reject(err);
            }
            resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') });
        });
    });
}

// Helper to perform the download work (extracted from downloadHandler)
async function performDownloadTask(videoId?: string, title?: string, artist?: string) {
    const timestamp = Date.now();
    const tmpDir = os.tmpdir();

    // Build search query
    let searchQuery = '';
    if (artist && title) searchQuery = `${artist} ${title}`;
    else if (title) searchQuery = title;
    else if (artist) searchQuery = artist;
    searchQuery = searchQuery.trim();

    // 1. YouTube thumbnail (save into permanent thumbnails folder)
    let youtubeThumbnailPath: string | null = null;
    if (videoId) {
        try {
            const ytThumbUrl = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
            const response = await (globalThis as any).fetch(ytThumbUrl);
            const thumbBasename = `yt-thumb-${timestamp}.jpg`;
            const thumbDest = path.join(PERM_THUMB_DIR, thumbBasename);
            if (response.ok) {
                const buffer = Buffer.from(await response.arrayBuffer());
                await fs.promises.writeFile(thumbDest, buffer);
                youtubeThumbnailPath = thumbDest;
            } else {
                const ytThumbUrlStd = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
                const response2 = await (globalThis as any).fetch(ytThumbUrlStd);
                if (response2.ok) {
                    const buffer = Buffer.from(await response2.arrayBuffer());
                    await fs.promises.writeFile(thumbDest, buffer);
                    youtubeThumbnailPath = thumbDest;
                }
            }
        } catch (e: any) {
            console.warn('YouTube thumbnail failed:', e?.message || e);
        }
    }

    // 2. Search SoundCloud
    let scData: any = null;
    try {
        const { stdout } = await runExecFile('yt-dlp', ['--dump-json', `scsearch1:${searchQuery}`], {
            maxBuffer: 20 * 1024 * 1024,
            timeout: 30000
        });
        const lines = String(stdout).split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);
        if (lines.length === 0) throw new Error('No results from yt-dlp');
        scData = JSON.parse(lines[0]);
    } catch (e: any) {
        throw new Error('SoundCloud search failed: ' + (e?.message || e));
    }

    const scUrl = scData.webpage_url || scData.url;
    if (!scUrl) throw new Error('Song not found on SoundCloud');

    // 3. DOWNLOAD AUDIO FROM SOUNDCLOUD -> save directly into permanent audio folder
    const audioBasename = `audio-${timestamp}.mp3`;
    const audioDest = path.join(PERM_AUDIO_DIR, audioBasename);

    try {
        await runExecFile('yt-dlp', [
            '-f', 'bestaudio',
            '--extract-audio',
            '--audio-format', 'mp3',
            '--audio-quality', '128K',
            '-o', audioDest,
            '--no-warnings',
            scUrl
        ], {
            maxBuffer: 200 * 1024 * 1024,
            timeout: 120000
        });
    } catch (e: any) {
        console.error('SoundCloud download failed:', e?.message || e);
        throw new Error('SoundCloud audio download failed: ' + (e?.message || e));
    }

    if (!fs.existsSync(audioDest)) {
        throw new Error('No audio file created');
    }

    console.log('✅ Audio downloaded from SoundCloud to', audioDest);

    // 4. SOUNDCLOUD THUMBNAIL FALLBACK (if YouTube failed) - save to permanent thumbnails folder
    let finalThumbnailPath = youtubeThumbnailPath;
    if (!finalThumbnailPath && scData.thumbnail) {
        try {
            const response = await (globalThis as any).fetch(scData.thumbnail);
            if (response.ok) {
                const thumbBasename = `sc-thumb-${timestamp}.jpg`;
                const thumbDest = path.join(PERM_THUMB_DIR, thumbBasename);
                const buffer = Buffer.from(await response.arrayBuffer());
                await fs.promises.writeFile(thumbDest, buffer);
                finalThumbnailPath = thumbDest;
                console.log('✅ SoundCloud thumbnail downloaded (fallback) to', thumbDest);
            }
        } catch (e) {
            console.warn('⚠️ SoundCloud thumbnail failed');
        }
    }

    // 5. Size check
    const stats = fs.statSync(audioDest);
    if (stats.size > 50 * 1024 * 1024) {
        try { fs.unlinkSync(audioDest); } catch (e) { }
        if (finalThumbnailPath) {
            try { fs.unlinkSync(finalThumbnailPath); } catch (e) { }
        }
        throw new Error('File too large (>50MB)');
    }

    // 6. Match quality (reuse function in file)
    const matchQuality = calculateMatchQuality(title || '', scData.title || '', artist);

    const result = {
        // Return stable public URLs pointing to permanent storage
        audioPath: `/data/${path.basename(audioDest)}`,
        thumbnailPath: finalThumbnailPath ? `/uploads/thumbnails/${path.basename(finalThumbnailPath)}` : null,
        metadata: {
            youtubeTitle: title || 'Unknown',
            soundcloudTitle: scData.title || '',
            artist: scData.uploader || scData.uploader_id || artist || 'Unknown',
            duration: parseInt(String(scData.duration || '0'), 10) || 0,
            description: scData.description || '',
            matchQuality,
            thumbnailSource: youtubeThumbnailPath ? 'YouTube' : (finalThumbnailPath ? 'SoundCloud' : null)
        },
        source: 'hybrid'
    };

    return result;
}

// Download handler: enqueue job, run in background and wait briefly for quick completion
const downloadHandler = async (req: Request, res: Response): Promise<void> => {
    try {
        const { videoId, title, artist } = req.body as { videoId?: string; title?: string; artist?: string };

        console.log('📥 Download request (enqueue):', JSON.stringify({ videoId, title, artist }));

        const jobId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        const job: Job = { id: jobId, status: 'pending', createdAt: Date.now(), updatedAt: Date.now() };
        jobs.set(jobId, job);

        // Start background processing
        (async () => {
            try {
                const result = await performDownloadTask(videoId, title, artist);
                const j = jobs.get(jobId);
                if (j) {
                    j.status = 'done';
                    j.result = result;
                    j.updatedAt = Date.now();
                    jobs.set(jobId, j);
                }
            } catch (err: any) {
                console.error('Background download job failed:', err?.message || err);
                const j = jobs.get(jobId);
                if (j) {
                    j.status = 'failed';
                    j.error = err?.message || String(err);
                    j.updatedAt = Date.now();
                    jobs.set(jobId, j);
                }
            }
        })();

        // Wait up to 45 seconds for quick jobs to finish to maintain compatibility
        const waitTimeoutMs = 45000;
        const pollIntervalMs = 500;
        const start = Date.now();

        const waitForResult = () => new Promise<void>((resolve) => {
            const iv = setInterval(() => {
                const j = jobs.get(jobId);
                if (!j) {
                    clearInterval(iv);
                    resolve();
                    return;
                }
                if (j.status === 'done' || j.status === 'failed') {
                    clearInterval(iv);
                    resolve();
                    return;
                }
                if (Date.now() - start > waitTimeoutMs) {
                    clearInterval(iv);
                    resolve();
                    return;
                }
            }, pollIntervalMs);
        });

        await waitForResult();

        const finishedJob = jobs.get(jobId);
        if (finishedJob?.status === 'done') {
            // Return result immediately
            res.json(finishedJob.result);
            return;
        }
        if (finishedJob?.status === 'failed') {
            res.status(500).json({ error: finishedJob.error || 'Download failed' });
            return;
        }

        // Job still pending -> return 202 with jobId so client can poll
        res.status(202).json({ jobId, message: 'Processing started. Poll /api/youtube/download/status/:jobId' });
        return;

    } catch (error: any) {
        console.error('Download enqueue error:', error);
        res.status(500).json({ error: 'Download failed' });
        return;
    }
};

// Status endpoint
const statusHandler = (req: Request, res: Response): void => {
    const { jobId } = req.params as { jobId?: string };
    if (!jobId) { res.status(400).json({ error: 'jobId required' }); return; }
    const job = jobs.get(jobId);
    if (!job) { res.status(404).json({ error: 'Job not found' }); return; }
    res.json({ id: job.id, status: job.status, createdAt: job.createdAt, updatedAt: job.updatedAt, error: job.error });
    return;
};

// Result endpoint
const resultHandler = (req: Request, res: Response): void => {
    const { jobId } = req.params as { jobId?: string };
    if (!jobId) { res.status(400).json({ error: 'jobId required' }); return; }
    const job = jobs.get(jobId);
    if (!job) { res.status(404).json({ error: 'Job not found' }); return; }
    if (job.status === 'pending') { res.status(202).json({ status: 'pending' }); return; }
    if (job.status === 'failed') { res.status(500).json({ error: job.error || 'Job failed' }); return; }
    res.json(job.result);
    return;
};

// ========================================================================
// YOUTUBE SEARCH - USING WORKING youtube-search-api
// ========================================================================

const searchHandler = async (req: Request, res: Response): Promise<void> => {
    try {
        const { query } = req.body;
        if (!query || typeof query !== 'string' || query.trim() === '') {
            res.status(400).json({ error: 'Query required' });
            return;
        }

        console.log(`🔍 Searching YouTube with youtube-search-api: "${query}"`);

        // Use the WORKING youtube-search-api (same as 18 hours ago)
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
                    thumbnail: bestThumb, // Beautiful YouTube thumbnail!
                    duration: item.length?.simpleText || item.lengthText || item.duration || '',
                    description: item.description || '',
                    source: 'youtube'
                };
            });

        console.log(`✅ Found ${formatted.length} YouTube results with thumbnails`);
        res.json({ data: formatted });
        return;

    } catch (error) {
        console.error('YouTube search error:', error);
        res.status(500).json({ error: 'Search failed' });
        return;
    }
};

// ========================================================================
// DOWNLOAD - HYBRID APPROACH
// ========================================================================

function calculateMatchQuality(youtubeTitle: string, soundcloudTitle: string, artist?: string): 'good' | 'uncertain' {
    if (!youtubeTitle || !soundcloudTitle) return 'uncertain';

    const normalize = (str: string) => str
        .toLowerCase()
        .replace(/[^\w\s-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const ytNorm = normalize(youtubeTitle);
    const scNorm = normalize(soundcloudTitle);

    const extractMainTitle = (str: string) => {
        const parts = str.split(/[-–—([\]]/);
        return normalize(parts[0]);
    };

    const ytMain = extractMainTitle(ytNorm);
    const scMain = extractMainTitle(scNorm);

    if (artist) {
        const artistNorm = normalize(artist);
        const ytHasArtist = ytNorm.includes(artistNorm);
        const scHasArtist = scNorm.includes(artistNorm);
        if (ytHasArtist && !scHasArtist) return 'uncertain';
    }

    const ytWords = new Set(ytMain.split(' ').filter(w => w.length > 2));
    const scWords = new Set(scMain.split(' ').filter(w => w.length > 2));
    const commonWords = [...ytWords].filter(w => scWords.has(w));
    const minWords = Math.min(ytWords.size, scWords.size);

    if (minWords > 0 && (commonWords.length / minWords) >= 0.6) return 'good';
    if (ytMain.includes(scMain) || scMain.includes(ytMain)) return 'good';
    if (ytMain === scMain) return 'good';

    return 'uncertain';
}

const downloadFileHandler = async (req: Request, res: Response): Promise<void> => {
    try {
        const { filename } = req.params as { filename?: string };
        if (!filename) {
            res.status(400).json({ error: 'Invalid filename' });
            return;
        }

        const isAudio = filename.startsWith('audio-') && filename.endsWith('.mp3');
        const isThumbnail = filename.startsWith('yt-thumb-') || filename.startsWith('sc-thumb-');

        if (!isAudio && !isThumbnail) {
            res.status(400).json({ error: 'Invalid filename' });
            return;
        }

        // The download-file handler still serves temp files; keep behavior for compatibility
        const filepath = path.join(os.tmpdir(), filename);
        if (!fs.existsSync(filepath)) {
            res.status(404).json({ error: 'File not found' });
            return;
        }

        if (isAudio) {
            res.setHeader('Content-Type', 'audio/mpeg');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        } else {
            res.setHeader('Content-Type', 'image/jpeg');
        }

        const stream = fs.createReadStream(filepath);
        stream.pipe(res);

        // Do NOT delete the temp file immediately after serving — keep it available for the import endpoint.
        stream.on('end', () => {
            console.log('Served temp file (kept for import):', filepath);
        });

        stream.on('error', (err) => {
            console.error('Stream error:', err);
            try { res.end(); } catch (e) { }
        });
    } catch (err: any) {
        console.error('File handler error:', err);
        res.status(500).json({ error: 'Failed to serve file' });
        return;
    }
};

// Export the handler so server can mount it publicly (no auth) if desired
export { downloadFileHandler };

// ========================================================================
// ROUTES
// ========================================================================

router.get('/download-file/:filename', downloadFileHandler);
router.post('/search', searchHandler);
router.post('/download', downloadHandler);
router.get('/download/status/:jobId', statusHandler);
router.get('/download/result/:jobId', resultHandler);

export default router;

