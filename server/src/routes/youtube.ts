import { Router, RequestHandler } from 'express';
import { fileURLToPath } from 'url';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile as execFileCb } from 'child_process';

// Resolve directory name in ESM/CommonJS
let baseDir = process.cwd();
try {
    // @ts-ignore
    baseDir = path.dirname(fileURLToPath(import.meta.url));
} catch (e) {
    if (typeof __dirname !== 'undefined') baseDir = __dirname;
}

const router = Router();

// ========================================================================
// CONFIGURATION & RUNTIME DETECTION
// ========================================================================

const YTDLP_CONFIG = {
    jsRuntime: 'node',
    remoteComponents: 'ejs:github',
    playerClient: 'web',
    searchTimeout: 30000,
    downloadTimeout: 120000,
};

// Detect available JavaScript runtime
function detectJSRuntime(): string | null {
    try {
        execFileCb('node', ['--version'], (err) => {
            if (!err) console.log('✅ Node.js runtime detected');
        });
        return 'node';
    } catch (e) {
        try {
            execFileCb('deno', ['--version'], (err) => {
                if (!err) console.log('✅ Deno runtime detected');
            });
            return 'deno';
        } catch (e2) {
            console.warn('⚠️ No JavaScript runtime found. YouTube extraction will fail.');
            console.warn('⚠️ Install Node.js or Deno for YouTube support.');
            return null;
        }
    }
}

const availableRuntime = detectJSRuntime();

// ========================================================================
// SMART MATCHING
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

        if (ytHasArtist && !scHasArtist) {
            return 'uncertain';
        }
    }

    const ytWords = new Set(ytMain.split(' ').filter(w => w.length > 2));
    const scWords = new Set(scMain.split(' ').filter(w => w.length > 2));

    const commonWords = [...ytWords].filter(w => scWords.has(w));
    const minWords = Math.min(ytWords.size, scWords.size);

    if (minWords > 0) {
        const overlap = commonWords.length / minWords;
        if (overlap >= 0.6) return 'good';
    }

    if (ytMain.includes(scMain) || scMain.includes(ytMain)) {
        return 'good';
    }

    if (ytMain === scMain) {
        return 'good';
    }

    return 'uncertain';
}

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

function buildYtDlpArgs(isYouTube: boolean = false): string[] {
    const args: string[] = [];

    if (isYouTube && availableRuntime) {
        args.push('--js-runtimes', `${availableRuntime}`);
        args.push('--remote-components', YTDLP_CONFIG.remoteComponents);
        args.push('--extractor-args', `youtube:player_client=${YTDLP_CONFIG.playerClient}`);
    }

    return args;
}

// ========================================================================
// ROUTE HANDLERS
// ========================================================================

const searchYouTube: RequestHandler = async (req, res) => {
    try {
        const { query } = req.body as { query?: string };
        if (!query) {
            res.status(400).json({ error: 'Query required' });
            return;
        }

        console.log(`🔍 Searching for: "${query}"`);

        // TRY SOUNDCLOUD FIRST
        try {
            const searchArg = `scsearch10:${query}`;
            const { stdout } = await runExecFile('yt-dlp', ['--dump-json', searchArg], {
                maxBuffer: 100 * 1024 * 1024,
                timeout: YTDLP_CONFIG.searchTimeout
            });

            const lines = String(stdout || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);

            if (lines.length > 0) {
                const items: any[] = [];
                for (const line of lines) {
                    try {
                        const info = JSON.parse(line);
                        items.push({
                            videoId: info.id || info.webpage_url || info.url || null,
                            title: info.title || '',
                            channelName: info.uploader || info.uploader_id || '',
                            thumbnail: info.thumbnail || (info.thumbnails?.length ? info.thumbnails[info.thumbnails.length - 1].url : null),
                            duration: info.duration ? `${Math.floor(info.duration / 60)}:${String(info.duration % 60).padStart(2, '0')}` : 'N/A',
                            description: info.description || '',
                            source: 'soundcloud'
                        });
                    } catch (err) {
                        // ignore
                    }
                }

                console.log(`✅ Found ${items.length} results from SoundCloud`);
                res.json({ data: items, source: 'soundcloud' });
                return;
            }
        } catch (scError: any) {
            console.warn('⚠️ SoundCloud search failed:', scError.message);
        }

        // FALLBACK TO YOUTUBE
        if (availableRuntime) {
            try {
                console.log('🔄 Trying YouTube as fallback...');
                const searchArg = `ytsearch10:${query}`;
                const ytdlpArgs = ['--dump-json', searchArg, ...buildYtDlpArgs(true)];

                const { stdout } = await runExecFile('yt-dlp', ytdlpArgs, {
                    maxBuffer: 100 * 1024 * 1024,
                    timeout: YTDLP_CONFIG.searchTimeout
                });

                const lines = String(stdout || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
                const items: any[] = [];

                for (const line of lines) {
                    try {
                        const info = JSON.parse(line);
                        items.push({
                            videoId: info.id || '',
                            title: info.title || '',
                            channelName: info.uploader || info.channel || '',
                            thumbnail: info.thumbnail || (info.thumbnails?.length ? info.thumbnails[info.thumbnails.length - 1].url : null),
                            duration: info.duration ? `${Math.floor(info.duration / 60)}:${String(info.duration % 60).padStart(2, '0')}` : 'N/A',
                            description: info.description || '',
                            source: 'youtube'
                        });
                    } catch (err) {
                        // ignore
                    }
                }

                console.log(`✅ Found ${items.length} results from YouTube`);
                res.json({ data: items, source: 'youtube' });
                return;
            } catch (ytError: any) {
                const stderr = String(ytError?.stderr || ytError?.stdout || ytError?.message || '');

                if (stderr.includes('Sign in to confirm')) {
                    console.warn('⚠️ YouTube blocked (VPS IP detected).');
                } else {
                    console.error('❌ YouTube search error:', stderr);
                }
            }
        }

        res.status(500).json({
            error: 'Search failed',
            message: 'Both SoundCloud and YouTube search failed.'
        });

    } catch (error: any) {
        console.error('Search error:', error);
        res.status(500).json({ error: 'Search failed' });
    }
};

const downloadYouTube: RequestHandler = async (req, res) => {
    try {
        const { videoId, title, artist } = req.body as { videoId?: string; title?: string; artist?: string };

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
        console.log(`📹 YouTube video ID: ${videoId || 'N/A'}`);
        console.log(`🔍 Searching SoundCloud: "${searchQuery}"`);

        let thumbnailPath: string | null = null;

        // 1. TRY YOUTUBE THUMBNAIL
        if (videoId && availableRuntime) {
            try {
                console.log('📸 Attempting YouTube thumbnail download...');
                const ytUrl = videoId.startsWith('http') ? videoId : `https://youtube.com/watch?v=${videoId}`;
                const thumbTempName = `thumb-yt-${timestamp}`;
                const ytdlpArgs = [
                    '--write-thumbnail',
                    '--skip-download',
                    '--convert-thumbnails', 'jpg',
                    '-o', path.join(tmpDir, thumbTempName),
                    ...buildYtDlpArgs(true),
                    ytUrl
                ];

                await runExecFile('yt-dlp', ytdlpArgs, {
                    maxBuffer: 20 * 1024 * 1024,
                    timeout: 15000
                });

                const files = await fs.promises.readdir(tmpDir);
                const thumbFile = files.find(f => f.startsWith(`thumb-yt-${timestamp}`) && f.endsWith('.jpg'));

                if (thumbFile) {
                    const finalThumbPath = path.join(tmpDir, `thumbnail-${timestamp}.jpg`);
                    await fs.promises.rename(path.join(tmpDir, thumbFile), finalThumbPath);
                    thumbnailPath = finalThumbPath;
                    console.log('✅ YouTube thumbnail downloaded');
                }
            } catch (thumbError: any) {
                const stderr = String(thumbError?.stderr || thumbError?.message || '');
                if (stderr.includes('Sign in to confirm')) {
                    console.warn('⚠️ YouTube thumbnail blocked (VPS IP)');
                } else {
                    console.warn('⚠️ YouTube thumbnail failed:', thumbError?.message);
                }
            }
        }

        // 2. SEARCH SOUNDCLOUD
        console.log('🔍 Searching SoundCloud...');
        let searchOut: string;
        try {
            const { stdout } = await runExecFile('yt-dlp', ['--dump-json', `scsearch1:${searchQuery}`], {
                maxBuffer: 20 * 1024 * 1024,
                timeout: YTDLP_CONFIG.searchTimeout
            });
            searchOut = stdout;
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

        // 3. DOWNLOAD AUDIO
        console.log('⬇️ Downloading audio from SoundCloud...');
        const audioPath = path.join(tmpDir, `audio-${timestamp}.mp3`);

        try {
            await runExecFile('yt-dlp', [
                '-f', 'bestaudio',
                '--extract-audio',
                '--audio-format', 'mp3',
                '--audio-quality', '128K',
                '-o', audioPath,
                '--no-warnings',
                scUrl
            ], {
                maxBuffer: 200 * 1024 * 1024,
                timeout: YTDLP_CONFIG.downloadTimeout
            });
        } catch (e: any) {
            const stderr = String(e?.stderr || e?.stdout || e?.message || e);
            console.error('yt-dlp download failed:', stderr);
            res.status(500).json({ error: 'Download failed', message: stderr });
            return;
        }

        if (!fs.existsSync(audioPath)) {
            console.error('No audio file created');
            res.status(500).json({ error: 'Download failed', message: 'No audio file created' });
            return;
        }

        console.log('✅ Audio download complete');

        // 4. SOUNDCLOUD THUMBNAIL FALLBACK
        if (!thumbnailPath) {
            try {
                const thumbnailUrl = scData?.thumbnail;
                if (thumbnailUrl) {
                    console.log('📸 Downloading SoundCloud thumbnail...');
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

        // 5. CHECK SIZE
        const stats = fs.statSync(audioPath);
        if (stats.size > 50 * 1024 * 1024) {
            try { fs.unlinkSync(audioPath); } catch (e) { }
            if (thumbnailPath) {
                try { fs.unlinkSync(thumbnailPath); } catch (e) { }
            }
            res.status(400).json({ error: 'File too large (>50MB)' });
            return;
        }

        // 6. MATCH QUALITY
        const matchQuality = calculateMatchQuality(
            title || '',
            scData.title || '',
            artist
        );

        console.log(`🎯 Match quality: ${matchQuality}`);
        console.log(`   YouTube: "${title}"`);
        console.log(`   SoundCloud: "${scData.title}"`);
        if (artist) {
            console.log(`   Artist: "${artist}"`);
        }

        if (matchQuality === 'uncertain') {
            console.warn('⚠️ UNCERTAIN MATCH');
        }

        // 7. RETURN
        res.json({
            audioPath: `/api/youtube/download-file/${path.basename(audioPath)}`,
            thumbnailPath: thumbnailPath ? `/api/youtube/download-file/${path.basename(thumbnailPath)}` : null,
            metadata: {
                youtubeTitle: title || 'Unknown',
                soundcloudTitle: scData.title || '',
                artist: scData.uploader || scData.uploader_id || artist || 'Unknown Artist',
                duration: parseInt(String(scData.duration || '0'), 10) || 0,
                description: scData.description || '',
                matchQuality,
                thumbnailSource: thumbnailPath ? (thumbnailPath.includes('thumb-yt') ? 'YouTube' : 'SoundCloud') : null
            },
            source: 'SoundCloud',
            method: 'yt-dlp-soundcloud-2025'
        });

    } catch (error: any) {
        console.error('Download handler error:', error);
        res.status(500).json({ error: 'Download failed', message: error?.message || String(error) });
    }
};

const downloadFileHandler: RequestHandler = async (req, res) => {
    try {
        const { filename } = req.params as { filename?: string };
        if (!filename) {
            res.status(400).json({ error: 'Invalid filename' });
            return;
        }

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

        if (isAudio) {
            res.setHeader('Content-Type', 'audio/mpeg');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        } else {
            res.setHeader('Content-Type', 'image/jpeg');
        }

        const stream = fs.createReadStream(filepath);
        stream.pipe(res);

        stream.on('end', () => {
            fs.unlink(filepath, (err) => {
                if (err) console.error('Failed to delete temp file:', err);
            });
        });

        stream.on('error', (err) => {
            console.error('Error streaming file:', err);
            try { res.end(); } catch (e) { }
        });
    } catch (err: any) {
        console.error('download-file handler error:', err);
        res.status(500).json({ error: 'Failed to serve file', message: String(err) });
    }
};

// ========================================================================
// ROUTES
// ========================================================================

router.get('/download-file/:filename', downloadFileHandler);
router.post('/search', searchYouTube);
router.post('/download', downloadYouTube);

export default router;