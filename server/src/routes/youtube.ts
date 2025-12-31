import { Router, RequestHandler } from 'express';
import yts from 'youtube-search-api';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile as execFileCb } from 'child_process';

const router = Router();

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

// ========================================================================
// YOUTUBE SEARCH - USING WORKING youtube-search-api
// ========================================================================

const searchHandler: RequestHandler = async (req, res) => {
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

const downloadHandler: RequestHandler = async (req, res) => {
    try {
        const { videoId, title, artist } = req.body as { videoId?: string; title?: string; artist?: string };

        console.log('📥 Download request:', JSON.stringify({ videoId, title, artist }));

        // Build search query
        let searchQuery = '';
        if (artist && title) {
            searchQuery = `${artist} ${title}`;
        } else if (title) {
            searchQuery = title;
        } else if (artist) {
            searchQuery = artist;
        } else {
            res.status(400).json({
                error: 'At least title or artist is required',
                hint: 'Send { videoId, title } or { title, artist }'
            });
            return;
        }

        searchQuery = searchQuery.trim();
        const timestamp = Date.now();
        const tmpDir = os.tmpdir();

        console.log(`🔍 Searching SoundCloud: "${searchQuery}"`);

        // 1. DOWNLOAD YOUTUBE THUMBNAIL (if videoId provided)
        let youtubeThumbnailPath: string | null = null;
        if (videoId) {
            try {
                console.log('📸 Downloading YouTube thumbnail...');
                // Construct high-quality YouTube thumbnail URL
                const ytThumbUrl = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;

                const response = await fetch(ytThumbUrl);
                if (response.ok) {
                    const buffer = Buffer.from(await response.arrayBuffer());
                    youtubeThumbnailPath = path.join(tmpDir, `yt-thumb-${timestamp}.jpg`);
                    await fs.promises.writeFile(youtubeThumbnailPath, buffer);
                    console.log('✅ YouTube thumbnail downloaded');
                } else {
                    // Try standard quality
                    const ytThumbUrlStd = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
                    const response2 = await fetch(ytThumbUrlStd);
                    if (response2.ok) {
                        const buffer = Buffer.from(await response2.arrayBuffer());
                        youtubeThumbnailPath = path.join(tmpDir, `yt-thumb-${timestamp}.jpg`);
                        await fs.promises.writeFile(youtubeThumbnailPath, buffer);
                        console.log('✅ YouTube thumbnail downloaded (standard quality)');
                    }
                }
            } catch (e: any) {
                console.warn('⚠️ YouTube thumbnail failed:', e.message);
            }
        }

        // 2. SEARCH SOUNDCLOUD
        let searchOut: string;
        try {
            const { stdout } = await runExecFile('yt-dlp', ['--dump-json', `scsearch1:${searchQuery}`], {
                maxBuffer: 20 * 1024 * 1024,
                timeout: 30000
            });
            searchOut = stdout;
        } catch (e: any) {
            console.error('SoundCloud search failed:', e.message);
            res.status(500).json({ error: 'SoundCloud search failed' });
            return;
        }

        const lines = searchOut.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        if (lines.length === 0) {
            res.status(404).json({ error: 'No results found on SoundCloud' });
            return;
        }

        const scData = JSON.parse(lines[0]);
        const scUrl = scData.webpage_url || scData.url;
        if (!scUrl) {
            res.status(404).json({ error: 'Song not found on SoundCloud' });
            return;
        }

        console.log(`✅ Found on SoundCloud: ${scData.title}`);

        // 3. DOWNLOAD AUDIO FROM SOUNDCLOUD
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
                timeout: 120000
            });
        } catch (e: any) {
            console.error('SoundCloud download failed:', e.message);
            res.status(500).json({ error: 'Download failed' });
            return;
        }

        if (!fs.existsSync(audioPath)) {
            res.status(500).json({ error: 'No audio file created' });
            return;
        }

        console.log('✅ Audio downloaded from SoundCloud');

        // 4. SOUNDCLOUD THUMBNAIL FALLBACK (if YouTube failed)
        let finalThumbnailPath = youtubeThumbnailPath;
        if (!finalThumbnailPath && scData.thumbnail) {
            try {
                const response = await fetch(scData.thumbnail);
                const buffer = Buffer.from(await response.arrayBuffer());
                finalThumbnailPath = path.join(tmpDir, `sc-thumb-${timestamp}.jpg`);
                await fs.promises.writeFile(finalThumbnailPath, buffer);
                console.log('✅ SoundCloud thumbnail downloaded (fallback)');
            } catch (e) {
                console.warn('⚠️ SoundCloud thumbnail failed');
            }
        }

        // 5. CHECK SIZE
        const stats = fs.statSync(audioPath);
        if (stats.size > 50 * 1024 * 1024) {
            try { fs.unlinkSync(audioPath); } catch (e) { }
            if (finalThumbnailPath) {
                try { fs.unlinkSync(finalThumbnailPath); } catch (e) { }
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
        console.log(`📸 Thumbnail source: ${youtubeThumbnailPath ? 'YouTube' : 'SoundCloud'}`);

        res.json({
            audioPath: `/api/youtube/download-file/${path.basename(audioPath)}`,
            thumbnailPath: finalThumbnailPath ? `/api/youtube/download-file/${path.basename(finalThumbnailPath)}` : null,
            metadata: {
                youtubeTitle: title || 'Unknown',
                soundcloudTitle: scData.title || '',
                artist: scData.uploader || scData.uploader_id || artist || 'Unknown',
                duration: parseInt(String(scData.duration || '0'), 10) || 0,
                description: scData.description || '',
                matchQuality,
                thumbnailSource: youtubeThumbnailPath ? 'YouTube' : (finalThumbnailPath ? 'SoundCloud' : null)
            },
            source: 'hybrid' // YouTube thumbnail + SoundCloud audio
        });

    } catch (error: any) {
        console.error('Download error:', error);
        res.status(500).json({ error: 'Download failed' });
    }
};

// ========================================================================
// FILE HANDLER
// ========================================================================

const downloadFileHandler: RequestHandler = async (req, res) => {
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

        stream.on('end', () => {
            fs.unlink(filepath, (err) => {
                if (err) console.error('Delete failed:', err);
            });
        });

        stream.on('error', (err) => {
            console.error('Stream error:', err);
            try { res.end(); } catch (e) { }
        });
    } catch (err: any) {
        console.error('File handler error:', err);
        res.status(500).json({ error: 'Failed to serve file' });
    }
};

// ========================================================================
// ROUTES
// ========================================================================

router.get('/download-file/:filename', downloadFileHandler);
router.post('/search', searchHandler);
router.post('/download', downloadHandler);

export default router;