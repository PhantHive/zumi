import { Router, RequestHandler } from 'express';
import yts from 'youtube-search-api';
import { fileURLToPath } from 'url';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile as execFileCb, spawn } from 'child_process';

// Resolve directory name in ESM/CommonJS robustly (compiled code may run as ESM where __dirname is undefined)
let baseDir = process.cwd();
try {
    // Try ESM resolution
    // @ts-ignore
    baseDir = path.dirname(fileURLToPath(import.meta.url));
} catch (e) {
    // Fallback to CommonJS __dirname if available
    if (typeof __dirname !== 'undefined') baseDir = __dirname;
}

// Add ambient Window declarations for YouTube player globals used inside page.evaluate
declare global {
    interface Window {
        ytInitialPlayerResponse?: any;
        ytplayer?: any;
        ytcfg?: any;
    }
}

const router = Router();

// ========================================================================
// EXISTING HELPER FUNCTIONS (Keep as is)
// ========================================================================

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
    } else if (platform === 'darwin') {
        candidates.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
    } else {
        candidates.push('/usr/bin/google-chrome');
        candidates.push('/usr/bin/google-chrome-stable');
        candidates.push('/usr/bin/chromium');
        candidates.push('/usr/bin/chromium-browser');
    }
    for (const c of candidates) {
        try { if (fs.existsSync(c)) return c; } catch (e) { /* ignore */ }
    }
    return null;
}

// ========================================================================
// EXISTING DOWNLOAD METHODS (Keep as fallbacks)
// ========================================================================

// yt-dlp with Cookies (NO ACCOUNT, NO BAN RISK!)
async function ytDlpWithCookies(videoUrl: string, timestamp: number, tmpDir: string) {
    console.log('🍪 Attempting yt-dlp with anonymous cookies...');

    const cookiePath = getCookiePath();
    if (!cookiePath || !fs.existsSync(cookiePath)) {
        console.warn('⚠️ Cookie file not found at:', cookiePath);
        throw new Error('Cookie file not found');
    }

    console.log('✅ Using cookie file:', cookiePath);

    // Get video info first
    const infoArgs = ['--dump-json', '--no-warnings', '--cookies', cookiePath];
    infoArgs.push(videoUrl);

    let infoJson: any;
    try {
        const { stdout } = await runExecFile('yt-dlp', infoArgs);
        infoJson = JSON.parse(stdout);
    } catch (e: any) {
        const stderr = String(e?.stderr || e?.stdout || e?.message || e);
        console.error('yt-dlp info extraction failed:', stderr);
        throw new Error('Failed to get video info: ' + stderr);
    }

    // Download the audio
    const downloadArgs = [
        '-f', 'bestaudio',
        '--extract-audio',
        '--audio-format', 'mp3',
        '--audio-quality', '128K',
        '--cookies', cookiePath, // Use cookies
        '-o', path.join(tmpDir, `audio-${timestamp}.%(ext)s`),
        '--no-warnings'
    ];

    downloadArgs.push(videoUrl);

    try {
        await runExecFile('yt-dlp', downloadArgs, { maxBuffer: 50 * 1024 * 1024 });
    } catch (e: any) {
        const stderr = String(e?.stderr || e?.stdout || e?.message || e);
        console.error('yt-dlp download failed:', stderr);
        throw new Error('Download failed: ' + stderr);
    }

    // Find downloaded audio file
    const audioPath = path.join(tmpDir, `audio-${timestamp}.mp3`);
    if (!fs.existsSync(audioPath)) {
        throw new Error('Audio file was not created');
    }

    // Download thumbnail separately
    let thumbnailPath: string | null = null;
    if (infoJson.thumbnail) {
        try {
            const response = await fetch(infoJson.thumbnail);
            const buffer = Buffer.from(await response.arrayBuffer());
            thumbnailPath = path.join(tmpDir, `thumb-${timestamp}.jpg`);
            await fs.promises.writeFile(thumbnailPath, buffer);
        } catch (e) {
            console.warn('Thumbnail download failed:', e);
        }
    }

    return {
        info: infoJson,
        audioPath,
        thumbnailPath
    };
}

// ========================================================================
// ENDPOINTS
// ========================================================================

// Search endpoint (can optionally use Invidious for better reliability)
const searchHandler: RequestHandler = async (req, res) => {
    try {
        const { query } = req.body;
        if (!query) {
            res.status(400).json({ error: 'Query required' });
            return;
        }

        // Use youtube-search-api directly
        const results = await yts.GetListByKeyword(query, false, 20);
        const formatted = results.items.map((item: any) => ({
            videoId: item.id,
            title: item.title,
            channelName: item.channelTitle,
            thumbnail: item.thumbnail.thumbnails[item.thumbnail.thumbnails.length - 1].url,
            duration: item.length?.simpleText || 'N/A',
            description: item.description || ''
        }));

        res.json({ data: formatted });
    } catch (error: any) {
        console.error('Search error:', error);
        res.status(500).json({ error: 'Search failed' });
    }
};

// Download endpoint: simplified to use only yt-dlp with cookies (all other methods removed)
const downloadHandler: RequestHandler = async (req, res) => {
    try {
        const { videoId, cookieText } = req.body as { videoId?: string; cookieText?: string };
        // If client provided cookie content, save it to disk and use it
        if (cookieText) {
            try {
                const saved = await saveCookiesContent(cookieText);
                console.log('Saved cookies from request to:', saved);
            } catch (e: any) {
                console.warn('Failed to save provided cookies:', e?.message || e);
                // continue: yt-dlp will try existing cookies too
            }
        }
        const { videoId: _videoId } = { videoId };
        const vid = _videoId || videoId;
        const videoIdFinal = vid;
        if (!videoIdFinal) {
            res.status(400).json({ error: 'Video ID required' });
            return;
        }

        const videoUrl = `https://www.youtube.com/watch?v=${videoIdFinal}`;
        const timestamp = Date.now();
        const tmpDir = os.tmpdir();

        console.log('🎬 Starting download (cookies-only) for:', videoUrl);

        // Only method: yt-dlp with cookies
        let result: any;
        try {
            result = await ytDlpWithCookies(videoUrl, timestamp, tmpDir);
            console.log('✅ yt-dlp with cookies returned result');
        } catch (err: any) {
            console.error('❌ yt-dlp with cookies failed:', err?.message || err);

            // Inspect cookie file and include helpful diagnostics
            const cookiePath = getCookiePath();
            const cookieHealth = inspectCookieFile(cookiePath);

            // Provide actionable hint about cookies and which ones are missing
            res.status(500).json({
                error: 'Download failed',
                message: err?.message || String(err),
                cookiePath: cookieHealth.path,
                cookieOk: cookieHealth.ok,
                cookieFound: cookieHealth.found || [],
                cookieMissing: cookieHealth.missing || [],
                hint: cookieHealth.ok ?
                    'Cookies file appears to contain required tokens but yt-dlp still failed. Try exporting cookies using a browser extension (cookies.txt) while signed into YouTube, or run yt-dlp locally with --cookies to validate.' :
                    'Cookies file is missing required YouTube auth cookies. Export a Netscape cookies.txt from a browser while signed into YouTube (must include SID, HSID, SSID, SAPISID, APISID, LOGIN_INFO). Place it in server/src/config/youtube_anon.txt or /app/config/youtube_anon.txt, or POST it to /upload-cookies.'
            });
            return;
        }

        if (!result || !result.audioPath) {
            console.error('No audio file was created by yt-dlp');
            res.status(500).json({ error: 'Download failed', message: 'No audio file was created by yt-dlp' });
            return;
        }

        // Check file size
        const stats = fs.statSync(result.audioPath);
        if (stats.size > 50 * 1024 * 1024) {
            try { fs.unlinkSync(result.audioPath); } catch (e) { /* ignore */ }
            res.status(400).json({ error: 'File too large (>50MB)' });
            return;
        }

        // Try to extract metadata from yt-dlp info JSON
        const info = result.info || {};
        const metadata = {
            title: info.title || info.videoDetails?.title || '',
            artist: info.uploader || info.channel || info.videoDetails?.author || '',
            duration: parseInt(String(info.duration || info.videoDetails?.lengthSeconds || '0'), 10) || 0,
            description: info.description || info.videoDetails?.shortDescription || ''
        };

        res.json({
            audioPath: result.audioPath,
            thumbnailPath: result.thumbnailPath || null,
            metadata,
            method: 'yt-dlp-cookies'
        });

    } catch (error: any) {
        console.error('Download handler unexpected error:', error);
        res.status(500).json({ error: 'Download failed', message: error?.message || String(error) });
    }
};

// Stream endpoint: stream audio to client while saving a copy using yt-dlp + ffmpeg tee
const streamHandler: RequestHandler = async (req, res) => {
    try {
        const { videoId, cookieText } = req.body as { videoId?: string; cookieText?: string };
        // If client provided cookie content, save it to disk and use it
        if (cookieText) {
            try {
                const saved = await saveCookiesContent(cookieText);
                console.log('Saved cookies from request to:', saved);
            } catch (e: any) {
                console.warn('Failed to save provided cookies:', e?.message || e);
                // continue: yt-dlp will try existing cookies too
            }
        }
        if (!videoId) {
            res.status(400).json({ error: 'Video ID required' });
            return;
        }

        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
        const timestamp = Date.now();
        const tmpDir = os.tmpdir();

        const cookiePath = getCookiePath();
        if (!cookiePath) {
            res.status(500).json({ error: 'Cookie file not found', hint: 'Provide YOUTUBE_COOKIES_PATH or place cookies in /app/config' });
            return;
        }

        // Get info JSON first (for thumbnail/meta)
        let infoJson: any = null;
        try {
            const { stdout } = await runExecFile('yt-dlp', ['--dump-json', '--no-warnings', '--cookies', cookiePath, videoUrl]);
            infoJson = JSON.parse(stdout);
        } catch (e: any) {
            console.warn('yt-dlp info extraction failed (stream):', e?.message || e);
            // proceed without metadata
        }

        // Download thumbnail if available
        let thumbnailPath: string | null = null;
        if (infoJson?.thumbnail) {
            try {
                const resp = await fetch(infoJson.thumbnail);
                const buf = Buffer.from(await resp.arrayBuffer());
                thumbnailPath = path.join(tmpDir, `thumb-${timestamp}.jpg`);
                await fs.promises.writeFile(thumbnailPath, buf);
            } catch (e) {
                console.warn('Thumbnail download failed (stream):', e);
            }
        }

        const outPath = path.join(tmpDir, `audio-${timestamp}.mp3`);

        // Spawn yt-dlp to stdout
        const ytdlp = spawn('yt-dlp', ['-f', 'bestaudio', '-o', '-', '--no-warnings', '--cookies', cookiePath, videoUrl], { stdio: ['ignore', 'pipe', 'pipe'] });

        // Spawn ffmpeg to read from pipe and tee to file + stdout
        const ffArgs = ['-i', 'pipe:0', '-vn', '-c:a', 'libmp3lame', '-b:a', '128k', '-f', 'tee', `[f=mp3]${outPath}|[f=mp3]pipe:1`];
        const ff = spawn('ffmpeg', ffArgs, { stdio: ['pipe', 'pipe', 'inherit'] });

        // Pipe yt-dlp -> ffmpeg
        if (ytdlp.stdout) ytdlp.stdout.pipe(ff.stdin);

        // Stream ffmpeg stdout to response
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Transfer-Encoding', 'chunked');

        if (ff.stdout) {
            ff.stdout.on('data', (chunk) => {
                try { res.write(chunk); } catch (e) { /* ignore */ }
            });

            ff.stdout.on('end', () => {
                try { res.end(); } catch (e) { /* ignore */ }
            });
        }

        // Handle errors and exit
        ff.on('close', (code) => {
            console.log('ffmpeg closed with code', code);
            // Nothing else to do; response ended on end event
        });

        ytdlp.on('error', (err) => console.warn('yt-dlp spawn error:', err));
        ff.on('error', (err) => console.warn('ffmpeg spawn error:', err));

    } catch (err: any) {
        console.error('Stream handler error:', err);
        res.status(500).json({ error: 'Stream failed', message: err?.message || String(err) });
    }
};

// Health endpoint to validate cookies file contains required YouTube auth cookies
const cookieHealthHandler: RequestHandler = async (req, res) => {
    try {
        const cookiePath = getCookiePath();
        if (!cookiePath) {
            res.status(500).json({ ok: false, message: 'Cookie file not found', path: null });
            return;
        }

        const text = await fs.promises.readFile(cookiePath, 'utf8');
        const required = ['SID', 'HSID', 'SSID', 'SAPISID', 'APISID', 'LOGIN_INFO', 'YSC'];
        const found = new Set<string>();

        for (const line of text.split(/\r?\n/)) {
            const l = line.trim();
            if (!l || l.startsWith('#')) continue;
            const parts = l.split('\t');
            if (parts.length >= 7) {
                const name = parts[5];
                found.add(name);
            }
        }

        const missing = required.filter(r => !found.has(r));
        res.json({ ok: missing.length === 0, path: cookiePath, found: Array.from(found), missing });
    } catch (err: any) {
        res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
};

// Upload cookies endpoint (saves cookieText posted in body). Optional secret protection via env YOUTUBE_COOKIE_UPLOAD_SECRET
const uploadCookiesHandler: RequestHandler = async (req, res) => {
    try {
        const secret = process.env.YOUTUBE_COOKIE_UPLOAD_SECRET;
        if (secret) {
            const provided = (req.headers['x-upload-secret'] as string) || req.headers['authorization']?.toString().replace(/^Bearer\s+/i, '');
            if (!provided || provided !== secret) {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }
        }

        const { cookieText } = req.body as { cookieText?: string };
        if (!cookieText) {
            res.status(400).json({ error: 'cookieText required in body' });
            return;
        }

        const dest = await saveCookiesContent(cookieText);
        // Return health after saving
        const text = await fs.promises.readFile(dest, 'utf8');
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        res.json({ ok: true, path: dest, linesCount: lines.length });
    } catch (err: any) {
        res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
};

router.post('/search', searchHandler);
router.post('/download', downloadHandler);
router.post('/stream', streamHandler);
router.get('/cookie-health', cookieHealthHandler);
router.post('/upload-cookies', uploadCookiesHandler);

export default router;

// Helper: resolve cookie file path
function getCookiePath(): string | null {
    const cookieEnv = process.env.YOUTUBE_COOKIES_PATH;
    const cookieCandidates = [
        cookieEnv,
        // Prefer repo-mounted config inside server/src/config so copying files there works during development
        path.join(baseDir, '../config/youtube_anon.txt'),
        path.join(baseDir, '../config/youtube_anon.txt'),
        // Also accept container mount
        '/app/config/youtube_anon.txt',
        '/app/config/youtube_anon.txt',
        // legacy locations
        path.join(baseDir, '../../config/youtube_anon.txt'),
        path.join(baseDir, '../../config/youtube_anon.txt')
    ].filter(Boolean) as string[];

    for (const p of cookieCandidates) {
        try { if (p && fs.existsSync(p)) return p; } catch (e) { /* ignore */ }
    }
    return cookieCandidates[0] || null;
}

// Helper: inspect a cookie file and report missing YouTube auth cookies
function inspectCookieFile(cookiePath: string | null) {
    const required = ['SID', 'HSID', 'SSID', 'SAPISID', 'APISID', 'LOGIN_INFO', 'YSC'];
    if (!cookiePath) return { ok: false, path: null, found: [], missing: required };
    try {
        const text = fs.readFileSync(cookiePath, 'utf8');
        const found = new Set<string>();
        for (const line of text.split(/\r?\n/)) {
            const l = line.trim();
            if (!l || l.startsWith('#')) continue;
            const parts = l.split('\t');
            if (parts.length >= 7) {
                const name = parts[5];
                found.add(name);
            } else {
                // fallback: try space-separated name=value pairs
                const m = l.match(/(^|\s)([A-Za-z0-9_\-]+)=/);
                if (m) found.add(m[2]);
            }
        }
        const missing = required.filter(r => !found.has(r));
        return { ok: missing.length === 0, path: cookiePath, found: Array.from(found), missing };
    } catch (e: any) {
        return { ok: false, path: cookiePath, found: [], missing: required, error: e?.message || String(e) };
    }
}

// Helper: save cookie file content into container config so yt-dlp can use it
async function saveCookiesContent(cookieText: string): Promise<string> {
    // Prefer repo config (server/src/config) so copying to src/config works during development. Also write to /app/config if possible.
    const destCandidates = [
        path.join(baseDir, '../config/youtube_anon.txt'),
        path.join(baseDir, '../config/youtube_anon.txt'),
        '/app/config/youtube_anon.txt',
        '/app/config/youtube_anon.txt',
        path.join(baseDir, '../../config/youtube_anon.txt'),
        path.join(baseDir, '../../config/youtube_anon.txt')
    ];

    let lastError: any = null;
    for (const dest of destCandidates) {
        try {
            const dir = path.dirname(dest);
            await fs.promises.mkdir(dir, { recursive: true });
            await fs.promises.writeFile(dest, cookieText, 'utf8');
            console.log('✅ Saved cookies to', dest);
            // Ensure getCookiePath will pick a usable file by setting env var to the first successful destination
            process.env.YOUTUBE_COOKIES_PATH = dest;
            return dest;
        } catch (e: any) {
            // try next
            lastError = e;
            console.warn('Could not write cookies to', dest, e?.message || e);
        }
    }

    throw new Error('Failed to save cookie file to any destination: ' + (lastError?.message || String(lastError)));
}
