import { Router, RequestHandler } from 'express';
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

const router = Router();

// ========================================================================
// HELPERS
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

// getVideoInfo: works for SoundCloud via yt-dlp --dump-json
async function getVideoInfo(videoUrl: string): Promise<any> {
    try {
        const { stdout } = await runExecFile('yt-dlp', ['--dump-json', videoUrl], { maxBuffer: 50 * 1024 * 1024 });
        const lines = String(stdout || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        if (lines.length === 0) return null;
        if (lines.length === 1) return JSON.parse(lines[0]);
        return lines.map((l: string) => JSON.parse(l));
    } catch (e: any) {
        const stderr = String(e?.stderr || e?.stdout || e?.message || e);
        console.error('getVideoInfo yt-dlp failed:', stderr);
        throw new Error('Failed to get info: ' + stderr);
    }
}

// ========================================================================
// ROUTE HANDLERS (SoundCloud via yt-dlp)
// ========================================================================

// searchYouTube: retained name but performs SoundCloud search (scsearch)
const searchYouTube: RequestHandler = async (req, res) => {
    try {
        const { query } = req.body as { query?: string };
        if (!query) {
            res.status(400).json({ error: 'Query required' });
            return;
        }

        const searchArg = `scsearch10:${query}`;
        let stdout: string;
        try {
            const out = await runExecFile('yt-dlp', ['--dump-json', searchArg], { maxBuffer: 100 * 1024 * 1024 });
            stdout = out.stdout;
        } catch (e: any) {
            const stderr = String(e?.stderr || e?.stdout || e?.message || e);
            console.error('yt-dlp search failed:', stderr);
            res.status(500).json({ error: 'Search failed', message: stderr });
            return;
        }

        const lines = String(stdout || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        const items: any[] = [];
        for (const line of lines) {
            try {
                const info = JSON.parse(line);
                items.push({
                    videoId: info.id || info.webpage_url || info.url || null,
                    title: info.title || '',
                    channelName: info.uploader || info.uploader_id || info.uploader_url || '',
                    thumbnail: info.thumbnail || (info.thumbnails && info.thumbnails.length ? info.thumbnails[info.thumbnails.length - 1].url : null),
                    duration: info.duration ? `${Math.floor(info.duration / 60)}:${String(info.duration % 60).padStart(2, '0')}` : 'N/A',
                    description: info.description || ''
                });
            } catch (err) {
                // ignore parse errors
            }
        }

        res.json({ data: items });
    } catch (error: any) {
        console.error('Search error:', error);
        res.status(500).json({ error: 'Search failed' });
    }
};

// downloadYouTube: retained name but SEARCHES SoundCloud using title/artist and downloads the found URL
const downloadYouTube: RequestHandler = async (req, res) => {
    try {
        const { videoId, title, artist } = req.body as { videoId?: string; title?: string; artist?: string };

        // Build search query from title and artist
        let searchQuery = '';
        if (artist && title) {
            searchQuery = `${artist} ${title}`;
        } else if (title) {
            searchQuery = title;
        } else if (artist) {
            searchQuery = artist;
        } else {
            res.status(400).json({ error: 'At least title or artist is required' });
            return;
        }

        searchQuery = searchQuery.trim();
        const timestamp = Date.now();
        const tmpDir = os.tmpdir();

        console.log(`🔍 Starting download process...`);
        console.log(`📹 YouTube video: ${videoId || 'N/A'}`);
        console.log(`🔍 Searching SoundCloud: "${searchQuery}"`);

        let thumbnailPath: string | null = null;

        // 1. Download THUMBNAIL from YouTube (exact one user clicked)
        if (videoId) {
            try {
                console.log('📸 Downloading YouTube thumbnail...');
                const ytUrl = videoId.startsWith('http') ? videoId : `https://youtube.com/watch?v=${videoId}`;
                const thumbTempName = `thumb-yt-${timestamp}`;

                await runExecFile('yt-dlp', [
                    '--write-thumbnail',
                    '--skip-download',
                    '--convert-thumbnails', 'jpg',
                    '-o', path.join(tmpDir, thumbTempName),
                    ytUrl
                ], { maxBuffer: 20 * 1024 * 1024 });

                // Find the created thumbnail file
                const files = await fs.promises.readdir(tmpDir);
                const thumbFile = files.find(f => f.startsWith(`thumb-yt-${timestamp}`) && f.endsWith('.jpg'));

                if (thumbFile) {
                    const finalThumbPath = path.join(tmpDir, `thumbnail-${timestamp}.jpg`);
                    await fs.promises.rename(path.join(tmpDir, thumbFile), finalThumbPath);
                    thumbnailPath = finalThumbPath;
                    console.log('✅ YouTube thumbnail downloaded');
                }
            } catch (thumbError: any) {
                console.warn('⚠️ Could not download YouTube thumbnail:', thumbError?.message || thumbError);
                // Continue anyway - will try SoundCloud thumbnail as fallback
            }
        }

        // 2. Search SoundCloud for the song
        console.log('🔍 Searching SoundCloud...');
        let searchOut: string;
        try {
            const out = await runExecFile('yt-dlp', ['--dump-json', `scsearch1:${searchQuery}`], { maxBuffer: 20 * 1024 * 1024 });
            searchOut = out.stdout;
        } catch (e: any) {
            const stderr = String(e?.stderr || e?.stdout || e?.message || e);
            console.error('yt-dlp scsearch failed:', stderr);
            res.status(500).json({ error: 'SoundCloud search failed', message: stderr });
            return;
        }

        const lines = String(searchOut || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        if (lines.length === 0) {
            res.status(404).json({ error: 'No results from SoundCloud search' });
            return;
        }

        let scData: any;
        try {
            scData = JSON.parse(lines[0]);
        } catch (e: any) {
            console.error('Failed to parse scsearch output:', e?.message || e);
            res.status(500).json({ error: 'Failed to parse search result' });
            return;
        }

        const scUrl = scData.webpage_url || scData.url || scData.webpage_url_basename || null;
        if (!scUrl) {
            res.status(404).json({ error: 'Song not found on SoundCloud' });
            return;
        }

        console.log(`✅ Found on SoundCloud: ${scData.title || scUrl}`);
        console.log(`🎵 Artist: ${scData.uploader || 'Unknown'}`);

        // 3. Download audio from SoundCloud
        console.log('⬇️ Downloading audio from SoundCloud...');
        const audioPath = path.join(tmpDir, `audio-${timestamp}.mp3`);

        const downloadArgs = [
            '-f', 'bestaudio',
            '--extract-audio',
            '--audio-format', 'mp3',
            '--audio-quality', '128K',
            '-o', audioPath,
            '--no-warnings',
            scUrl
        ];

        try {
            await runExecFile('yt-dlp', downloadArgs, { maxBuffer: 200 * 1024 * 1024 });
        } catch (e: any) {
            const stderr = String(e?.stderr || e?.stdout || e?.message || e);
            console.error('yt-dlp download failed:', stderr);
            res.status(500).json({ error: 'Download failed', message: stderr });
            return;
        }

        if (!fs.existsSync(audioPath)) {
            console.error('No audio file was created by yt-dlp');
            res.status(500).json({ error: 'Download failed', message: 'No audio file was created by yt-dlp' });
            return;
        }

        console.log('✅ Audio download complete');

        // 4. If no YouTube thumbnail, try SoundCloud thumbnail as fallback
        if (!thumbnailPath) {
            try {
                const thumbnailUrl = scData?.thumbnail;
                if (thumbnailUrl) {
                    console.log('📸 Downloading SoundCloud thumbnail as fallback...');
                    const response = await fetch(thumbnailUrl);
                    const buffer = Buffer.from(await response.arrayBuffer());
                    thumbnailPath = path.join(tmpDir, `thumbnail-${timestamp}.jpg`);
                    await fs.promises.writeFile(thumbnailPath, buffer);
                    console.log('✅ SoundCloud thumbnail downloaded');
                }
            } catch (scThumbError) {
                console.warn('⚠️ Could not download SoundCloud thumbnail:', scThumbError);
            }
        }

        // 5. Check file size
        const stats = fs.statSync(audioPath);
        if (stats.size > 50 * 1024 * 1024) {
            try { fs.unlinkSync(audioPath); } catch (e) { /* ignore */ }
            if (thumbnailPath) {
                try { fs.unlinkSync(thumbnailPath); } catch (e) { /* ignore */ }
            }
            res.status(400).json({ error: 'File too large (>50MB)' });
            return;
        }

        // 6. Calculate match quality
        const youtubeTitle = (title || '').toLowerCase();
        const soundcloudTitle = (scData.title || '').toLowerCase();
        const scMainTitle = soundcloudTitle.split('-')[0].trim();

        const matchQuality = youtubeTitle.includes(scMainTitle) || scMainTitle.includes(youtubeTitle)
            ? 'good'
            : 'uncertain';

        console.log(`🎯 Match quality: ${matchQuality}`);
        console.log(`   YouTube: "${title}"`);
        console.log(`   SoundCloud: "${scData.title}"`);

        // 7. Return file paths and metadata
        const metadata = {
            youtubeTitle: title || 'Unknown',
            soundcloudTitle: scData.title || '',
            artist: scData.uploader || scData.uploader_id || artist || 'Unknown Artist',
            duration: parseInt(String(scData.duration || '0'), 10) || 0,
            description: scData.description || '',
            matchQuality,
            thumbnailSource: thumbnailPath ? (thumbnailPath.includes('thumb-yt') ? 'YouTube' : 'SoundCloud') : null
        };

        res.json({
            audioPath: `/api/youtube/download-file/${path.basename(audioPath)}`,
            thumbnailPath: thumbnailPath ? `/api/youtube/download-file/${path.basename(thumbnailPath)}` : null,
            metadata,
            source: 'SoundCloud',
            method: 'yt-dlp-soundcloud'
        });

    } catch (error: any) {
        console.error('Download handler unexpected error:', error);
        res.status(500).json({ error: 'Download failed', message: error?.message || String(error) });
    }
};

// Stream endpoint: unchanged except removing cookie usage
const streamHandler: RequestHandler = async (req, res) => {
    try {
        const { videoId } = req.body as { videoId?: string };
        if (!videoId) {
            res.status(400).json({ error: 'Video ID required' });
            return;
        }

        let videoUrl = videoId;
        if (!/^https?:\/\//i.test(videoUrl)) videoUrl = `https://soundcloud.com/${videoUrl}`;

        const timestamp = Date.now();
        const tmpDir = os.tmpdir();

        // Get info JSON first (for thumbnail/meta)
        let infoJson: any = null;
        try {
            infoJson = await getVideoInfo(videoUrl);
        } catch (e: any) {
            console.warn('yt-dlp info extraction failed (stream):', e?.message || e);
            // proceed without metadata
        }

        // Download thumbnail if available
        let thumbnailPath: string | null = null;
        const thumbUrl = infoJson?.thumbnail;
        if (thumbUrl) {
            try {
                const resp = await fetch(thumbUrl);
                const buf = Buffer.from(await resp.arrayBuffer());
                thumbnailPath = path.join(tmpDir, `thumb-${timestamp}.jpg`);
                await fs.promises.writeFile(thumbnailPath, buf);
            } catch (e) {
                console.warn('Thumbnail download failed (stream):', e);
            }
        }

        const outPath = path.join(tmpDir, `audio-${timestamp}.mp3`);

        // Spawn yt-dlp to stdout
        const ytdlp = spawn('yt-dlp', ['-f', 'bestaudio', '-o', '-', '--no-warnings', videoUrl], { stdio: ['ignore', 'pipe', 'pipe'] });

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

// New endpoint: serve temporary downloaded audio files from OS temp dir
const downloadFileHandler: RequestHandler = async (req, res) => {
    try {
        const { filename } = req.params as { filename?: string };
        if (!filename) {
            res.status(400).json({ error: 'Invalid filename' });
            return;
        }

        // Allow both audio and thumbnail files
        const isAudio = filename.startsWith('audio-') && filename.endsWith('.mp3');
        const isThumbnail = filename.startsWith('thumbnail-') && filename.endsWith('.jpg');

        if (!isAudio && !isThumbnail) {
            res.status(400).json({ error: 'Invalid filename' });
            return;
        }

        const filepath = path.join(os.tmpdir(), filename);
        if (!fs.existsSync(filepath)) {
            res.status(404).json({ error: 'File not found or expired' });
            return;
        }

        // Set appropriate content type
        if (isAudio) {
            res.setHeader('Content-Type', 'audio/mpeg');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        } else {
            res.setHeader('Content-Type', 'image/jpeg');
        }

        const stream = fs.createReadStream(filepath);
        stream.pipe(res);

        stream.on('end', () => {
            // best-effort cleanup after streaming
            fs.unlink(filepath, (err) => {
                if (err) console.error('Failed to delete temp file:', err);
            });
        });

        stream.on('error', (err) => {
            console.error('Error streaming file:', err);
            try { res.end(); } catch (e) { /* ignore */ }
        });
    } catch (err: any) {
        console.error('download-file handler error:', err);
        res.status(500).json({ error: 'Failed to serve file', message: String(err) });
    }
};

router.get('/download-file/:filename', downloadFileHandler);

router.post('/search', searchYouTube);
router.post('/download', downloadYouTube);
router.post('/stream', streamHandler);

export default router;
