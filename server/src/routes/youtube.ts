import { Router, RequestHandler } from 'express';
import ytdl from '@distube/ytdl-core';
import yts from 'youtube-search-api';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile as execFileCb } from 'child_process';
import puppeteer from 'puppeteer-core';

// Small wrapper to run execFile and return stdout/stderr as a promise
function runExecFile(command: string, args: string[], options: any = {}): Promise<{ stdout: string; stderr: string; }> {
    return new Promise((resolve, reject) => {
        execFileCb(command, args, options, (err, stdout, stderr) => {
            if (err) {
                // attach stdout/stderr for better diagnostics
                (err as any).stdout = stdout;
                (err as any).stderr = stderr;
                return reject(err);
            }
            resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') });
        });
    });
}

// Helper: locate a Chrome/Chromium executable for puppeteer-core across OSes
function findChromeExecutable(): string | null {
    const envPath = process.env.CHROME_PATH || process.env.CHROMIUM_PATH || process.env.CHROME_BIN;
    if (envPath && fs.existsSync(envPath)) return envPath;
    const platform = process.platform;
    const candidates: string[] = [];
    if (platform === 'win32') {
        const programFiles = process.env['PROGRAMFILES'] || 'C:\\Program Files';
        const programFilesx86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
        candidates.push(path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'));
        candidates.push(path.join(programFilesx86, 'Google', 'Chrome', 'Application', 'chrome.exe'));
        candidates.push(path.join(programFiles, 'Chromium', 'Application', 'chrome.exe'));
        candidates.push(path.join(programFilesx86, 'Chromium', 'Application', 'chrome.exe'));
    } else if (platform === 'darwin') {
        candidates.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
        candidates.push('/Applications/Chromium.app/Contents/MacOS/Chromium');
    } else {
        candidates.push('/usr/bin/google-chrome');
        candidates.push('/usr/bin/google-chrome-stable');
        candidates.push('/usr/bin/chromium');
        candidates.push('/usr/bin/chromium-browser');
        candidates.push('/snap/bin/chromium');
    }
    for (const c of candidates) {
        try { if (fs.existsSync(c)) return c; } catch (e) { /* ignore */ }
    }
    return null;
}

// Helper: locate a Deno executable for yt-dlp JS runtime
function findDenoExecutable(): string | null {
    const envPath = process.env.DENO_PATH || process.env.DENO_BIN || process.env.DENO;
    if (envPath && fs.existsSync(envPath)) return envPath;
    const candidates = [
        '/usr/local/bin/deno',
        '/usr/bin/deno',
        path.join(process.env.HOME || '', '.deno', 'bin', 'deno'),
        path.join('/home', 'thanatos', '.deno', 'bin', 'deno'),
    ];
    for (const c of candidates) {
        try { if (fs.existsSync(c)) return c; } catch (e) { /* ignore */ }
    }
    return null;
}

// Puppeteer fallback: try to get a direct audio URL by evaluating the page's player response.
async function puppeteerFallback(videoUrl: string, timestamp: number, tmpDir: string) {
    const exe = findChromeExecutable();
    if (!exe) throw new Error('No Chrome/Chromium executable found. Set CHROME_PATH or install Chrome/Chromium.');
    const browser = await puppeteer.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'], headless: true });
    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.goto(videoUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        const playerResp = await page.evaluate(() => {
            try {
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

        if (!playerResp || !playerResp.streamingData) return null;
        const formats = playerResp.streamingData.adaptiveFormats || [];
        const audioFormats = formats.filter((f: any) => f.mimeType && /audio\//.test(f.mimeType));
        const withUrl = audioFormats.find((f: any) => f.url) || audioFormats[0];
        if (!withUrl || !withUrl.url) return null;
        const audioUrl = withUrl.url as string;
        const audioPath = path.join(tmpDir, `audio-${timestamp}.mp3`);
        await new Promise<void>((resolve, reject) => {
            try {
                (ffmpeg as any)(audioUrl).audioBitrate(128).format('mp3').on('error', (err: Error) => reject(err)).on('end', () => resolve()).save(audioPath);
            } catch (e) { reject(e as Error); }
        });
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
            } catch (e) { /* ignore thumbnail errors */ }
        }
        return { info: playerResp, audioPath, thumbnailPath };
    } finally { try { await browser.close(); } catch (e) { /* ignore */ } }
}

async function ytDlpFallback(videoUrl: string, timestamp: number, tmpDir: string, cookies?: string | undefined) {
    const denoPath = findDenoExecutable();
    const jsRuntimeArgs = denoPath ? ['--js-runtimes', `deno:${denoPath}`] : [];
    const jsonCmd = [...jsRuntimeArgs, '-j', videoUrl];
    try {
        let infoJson: any = null;
        try {
            const out = await runExecFile('yt-dlp', jsonCmd, { maxBuffer: 10 * 1024 * 1024 });
            infoJson = JSON.parse(out.stdout);
        } catch (e: any) {
            // surface helpful errors
            const stderr = (e && (e.stderr || e.stdout)) ? String(e.stderr || e.stdout) : String(e?.message || e);
            if (stderr && /Sign in to confirm|Sign in to confirm you're not a bot|Sign in to continue/i.test(stderr)) {
                const ex = new Error('YT_AUTH_REQUIRED: yt-dlp requires authentication/cookies for this video. Provide cookies in request body.');
                (ex as any).details = stderr;
                throw ex;
            }
            if (e.code === 'ENOENT') throw new Error('yt-dlp not found on PATH. Install yt-dlp or add it to PATH.');
            // rethrow original for other cases, attach stderr
            const ex2 = new Error(String(e?.message || e));
            (ex2 as any).stderr = stderr;
            throw ex2;
        }

        const audioTemplate = path.join(tmpDir, `audio-${timestamp}.%(ext)s`);
        const args: string[] = [...jsRuntimeArgs, '-x', '--audio-format', 'mp3', '--no-post-overwrites', '--embed-thumbnail', '--add-metadata', '-o', audioTemplate, videoUrl];
        let cookieFilePath: string | null = null;
        if (cookies) {
            cookieFilePath = path.join(tmpDir, `cookies-${timestamp}.txt`);
            try { await fs.promises.writeFile(cookieFilePath, cookies, { encoding: 'utf8' }); args.unshift(cookieFilePath); args.unshift('--cookies'); } catch (e) { cookieFilePath = null; }
        }

        try {
            await runExecFile('yt-dlp', args, { maxBuffer: 50 * 1024 * 1024 });
        } catch (e: any) {
            const stderr = (e && (e.stderr || e.stdout)) ? String(e.stderr || e.stdout) : String(e?.message || e);
            if (stderr && /Sign in to confirm|Sign in to confirm you're not a bot|Sign in to continue/i.test(stderr)) {
                const ex = new Error('YT_AUTH_REQUIRED: yt-dlp requires authentication/cookies for this video. Provide cookies in request body.');
                (ex as any).details = stderr;
                throw ex;
            }
            if (e.code === 'ENOENT') throw new Error('yt-dlp not found on PATH. Install yt-dlp or add it to PATH.');
            const ex2 = new Error(String(e?.message || e));
            (ex2 as any).stderr = stderr;
            throw ex2;
        }

        // Find produced audio file and thumbnail
        const possibleAudio = path.join(tmpDir, `audio-${timestamp}.mp3`);
        const audioPath = fs.existsSync(possibleAudio) ? possibleAudio : null;
        const thumbExts = ['jpg', 'jpeg', 'png', 'webp', 'webm'];
        let thumbnailPath: string | null = null;
        for (const ext of thumbExts) {
            const p = path.join(tmpDir, `audio-${timestamp}.${ext}`);
            if (fs.existsSync(p)) { thumbnailPath = p; break; }
        }
        if (cookieFilePath) { try { fs.unlinkSync(cookieFilePath); } catch (e) { /* ignore */ } }
        return { info: infoJson, audioPath, thumbnailPath };
    } catch (err: any) { throw err; }
}

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
        const cookies = req.body.cookies as string | undefined;
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
                    const result = await ytDlpFallback(videoUrl, timestamp, tmpDir, cookies);
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
                    const msg = String(fallbackErr?.message || fallbackErr);
                    // Special-case authentication requirement from yt-dlp
                    if (msg.includes('YT_AUTH_REQUIRED') || msg.includes('requires authentication') || (fallbackErr && (fallbackErr as any).details && String((fallbackErr as any).details).toLowerCase().includes('sign in'))) {
                        // Return 401 with clear instructions for the client to provide cookies
                        res.status(401).json({
                            error: 'YT_AUTH_REQUIRED',
                            message: 'This video requires YouTube authentication/cookies. Export cookies from a browser and include them in the POST body as the "cookies" field.',
                            details: (fallbackErr as any).details || msg,
                        });
                        return;
                    }

                    res.status(500).json({ error: 'Download failed', message: 'ytdl blocked and yt-dlp fallback failed: ' + msg });
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

router.get('/check-deps', async (req, res) => {
    try {
        const chromePath = findChromeExecutable();
        let ytDlpVersion: string | null = null;
        try {
            const out = await runExecFile('yt-dlp', ['--version']);
            ytDlpVersion = (out.stdout || '').trim();
        } catch (e: any) {
            // not installed or not on PATH
            ytDlpVersion = null;
        }
        res.json({ chromePath: chromePath || null, ytDlpVersion });
    } catch (err: any) {
        res.status(500).json({ error: 'failed', message: String(err?.message || err) });
    }
});

router.post('/search', searchHandler);
router.post('/download', downloadHandler);

export default router;
