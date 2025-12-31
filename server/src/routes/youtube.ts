import { Router, RequestHandler } from 'express';
import ytdl from '@distube/ytdl-core';
import yts from 'youtube-search-api';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile as execFileCb } from 'child_process';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import axios from 'axios'; // ← NEW: For Invidious API

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
// 🌐 INVIDIOUS API - NEW PRIMARY METHOD (ZERO BAN RISK!)
// ========================================================================

/**
 * Invidious public instances (rotate for load balancing)
 */
const INVIDIOUS_INSTANCES = [
    'https://inv.riverside.rocks',
    'https://invidious.snopyta.org',
    'https://yewtu.be',
    'https://invidious.kavin.rocks',
    'https://vid.puffyan.us',
];

let currentInstanceIndex = 0;

/**
 * Get next Invidious instance (rotate)
 */
function getInvidiousInstance(): string {
    const instance = INVIDIOUS_INSTANCES[currentInstanceIndex];
    currentInstanceIndex = (currentInstanceIndex + 1) % INVIDIOUS_INSTANCES.length;
    return instance;
}

/**
 * Download via Invidious API with automatic instance rotation and retry
 * Tries all 5 instances before giving up (NO COOKIES, NO ACCOUNT, NO BAN RISK!)
 */
async function downloadViaInvidious(videoId: string, timestamp: number, tmpDir: string) {
    const maxRetries = INVIDIOUS_INSTANCES.length; // Try all instances
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        const instance = getInvidiousInstance();
        console.log(`🌐 Trying Invidious instance ${attempt + 1}/${maxRetries}: ${instance}`);

        try {
            // Get video info from Invidious API
            const response = await axios.get(`${instance}/api/v1/videos/${videoId}`, {
                timeout: 15000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                },
            });

            const videoData = response.data;
            console.log('✅ Video info retrieved:', videoData.title);
            console.log('🔍 DEBUG - Response keys:', Object.keys(videoData));
            console.log('🔍 DEBUG - Has adaptiveFormats?', !!videoData.adaptiveFormats);
            console.log('🔍 DEBUG - Has formatStreams?', !!videoData.formatStreams);

            // Validate response has required fields
            if (!videoData.adaptiveFormats && !videoData.formatStreams) {
                console.error('❌ Invalid Invidious response structure');
                console.error('Response data:', JSON.stringify(videoData, null, 2));
                throw new Error('Invalid response from Invidious API');
            }

            // Find best audio format
            const audioFormats = (videoData.adaptiveFormats || []).filter((f: any) =>
                f.type && f.type.includes('audio')
            );

            if (audioFormats.length === 0) {
                throw new Error('No audio formats found');
            }

            // Prefer webm/opus or m4a
            const bestAudio = audioFormats.find((f: any) =>
                f.container === 'webm' || f.container === 'm4a'
            ) || audioFormats[0];

            console.log('🎵 Audio format:', bestAudio.container, bestAudio.bitrate);

            // Download audio using ffmpeg
            const audioPath = path.join(tmpDir, `audio-${timestamp}.mp3`);

            await new Promise<void>((resolve, reject) => {
                (ffmpeg as any)(bestAudio.url)
                    .audioBitrate(128)
                    .audioCodec('libmp3lame')
                    .format('mp3')
                    .on('start', (cmd: string) => {
                        console.log('🎬 FFmpeg started');
                    })
                    .on('progress', (progress: any) => {
                        if (progress.percent) {
                            console.log(`📥 Download progress: ${progress.percent.toFixed(0)}%`);
                        }
                    })
                    .on('error', (err: Error) => {
                        console.error('❌ FFmpeg error:', err);
                        reject(err);
                    })
                    .on('end', () => {
                        console.log('✅ Audio download complete!');
                        resolve();
                    })
                    .save(audioPath);
            });

            // Download thumbnail
            let thumbnailPath: string | null = null;

            if (videoData.videoThumbnails && videoData.videoThumbnails.length > 0) {
                const thumbnails = videoData.videoThumbnails;
                const bestThumb = thumbnails[thumbnails.length - 1]; // Highest quality

                try {
                    const thumbResponse = await axios.get(bestThumb.url, {
                        responseType: 'arraybuffer',
                        timeout: 10000,
                    });

                    thumbnailPath = path.join(tmpDir, `thumb-${timestamp}.jpg`);
                    await fs.promises.writeFile(thumbnailPath, thumbResponse.data);
                    console.log('✅ Thumbnail downloaded!');
                } catch (thumbError) {
                    console.warn('⚠️ Thumbnail download failed:', thumbError);
                }
            }

            // SUCCESS! Return result
            console.log(`✅ Invidious download successful using instance: ${instance}`);
            return {
                info: {
                    videoDetails: {
                        title: videoData.title,
                        author: videoData.author,
                        lengthSeconds: videoData.lengthSeconds,
                        viewCount: videoData.viewCount,
                        uploadDate: videoData.published,
                    }
                },
                audioPath,
                thumbnailPath,
            };

        } catch (error: any) {
            lastError = error;
            const errorMsg = error.response?.status
                ? `${error.response.status} ${error.response.statusText}`
                : error.message;

            console.warn(`⚠️ Instance ${instance} failed (${errorMsg}), trying next instance...`);

            // If this was the last attempt, don't continue
            if (attempt === maxRetries - 1) {
                console.error(`❌ All ${maxRetries} Invidious instances failed`);
                break;
            }

            // Wait a bit before trying next instance (avoid hammering)
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    // All instances failed
    throw new Error(`Invidious download failed after trying all ${maxRetries} instances: ${lastError?.message}`);
}

/**
 * Search via Invidious with retry (optional enhancement for search endpoint)
 */
async function searchViaInvidious(query: string, limit: number = 20) {
    const maxRetries = INVIDIOUS_INSTANCES.length;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        const instance = getInvidiousInstance();

        try {
            const response = await axios.get(`${instance}/api/v1/search`, {
                params: {
                    q: query,
                    type: 'video',
                    page: 1,
                },
                timeout: 10000,
            });

            const results = response.data.slice(0, limit).map((video: any) => ({
                videoId: video.videoId,
                title: video.title,
                channelName: video.author,
                thumbnail: video.videoThumbnails[0]?.url || '',
                duration: video.lengthSeconds,
                description: video.description || '',
            }));

            return results;
        } catch (error: any) {
            lastError = error;
            console.warn(`⚠️ Invidious search failed on ${instance}, trying next...`);

            if (attempt === maxRetries - 1) {
                break;
            }

            await new Promise(resolve => setTimeout(resolve, 300));
        }
    }

    throw new Error(`Invidious search failed after trying all instances: ${lastError?.message}`);
}

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

// Extract PO Token from YouTube page (NO COOKIES NEEDED!)
async function extractPoTokenFromPage(videoUrl: string): Promise<{ visitorData: string; poToken: string } | null> {
    const exe = findChromeExecutable();
    if (!exe) return null;

    puppeteer.use(StealthPlugin());

    const browser = await puppeteer.launch({
        executablePath: exe,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        headless: true
    });

    try {
        const page = await browser.newPage();

        // Set realistic user agent
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // Go to YouTube page
        await page.goto(videoUrl, { waitUntil: 'networkidle2', timeout: 30000 });

        // Extract visitor data and PO token from page
        const tokens = await page.evaluate(() => {
            try {
                const w: any = window as any;
                const ytcfg = w.ytcfg;
                if (ytcfg && ytcfg.data_) {
                    const visitorData = ytcfg.data_.VISITOR_DATA || ytcfg.data_.visitorData;
                    const delegatedSessionId = ytcfg.data_.DELEGATED_SESSION_ID;

                    return {
                        visitorData: visitorData || null,
                        poToken: delegatedSessionId || null
                    };
                }
            } catch (e) {
                console.error('Failed to extract tokens:', e);
            }
            return null;
        });

        return tokens;
    } finally {
        try { await browser.close(); } catch (e) { /* ignore */ }
    }
}

// Enhanced Puppeteer extraction with better headers
async function puppeteerExtraction(videoUrl: string, timestamp: number, tmpDir: string) {
    const exe = findChromeExecutable();
    if (!exe) throw new Error('Chrome/Chromium not found');

    const browser = await puppeteer.launch({
        executablePath: exe,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-web-security', // Allow cross-origin requests
        ],
        headless: true
    });

    try {
        const page = await browser.newPage();

        // Set comprehensive headers to look like real browser
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        });

        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // Navigate to video
        console.log('Puppeteer: Loading YouTube page...');
        await page.goto(videoUrl, { waitUntil: 'networkidle2', timeout: 30000 });

        // Wait a bit for player to initialize (FIXED: use setTimeout instead of waitForTimeout)
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Extract player response
        const playerData = await page.evaluate(() => {
            try {
                const w: any = window as any;
                if (w.ytInitialPlayerResponse) {
                    return w.ytInitialPlayerResponse;
                }
                if (w.ytplayer?.config?.args?.player_response) {
                    return JSON.parse(w.ytplayer.config.args.player_response);
                }
            } catch (e) {
                console.error('Failed to extract player data:', e);
            }
            return null;
        });

        if (!playerData || !playerData.streamingData) {
            throw new Error('No streaming data found in player response');
        }

        // Get audio formats
        const formats = playerData.streamingData.adaptiveFormats || [];
        const audioFormats = formats.filter((f: any) => f.mimeType && /audio\//.test(f.mimeType));
        const bestAudio = audioFormats.find((f: any) => f.url) || audioFormats[0];

        if (!bestAudio || !bestAudio.url) {
            throw new Error('No audio URL found');
        }

        const audioUrl = bestAudio.url as string;
        console.log('Puppeteer: Found audio URL, downloading...');

        // Download audio using ffmpeg
        const audioPath = path.join(tmpDir, `audio-${timestamp}.mp3`);
        await new Promise<void>((resolve, reject) => {
            (ffmpeg as any)(audioUrl)
                .audioBitrate(128)
                .format('mp3')
                .on('error', reject)
                .on('end', resolve)
                .save(audioPath);
        });

        // Download thumbnail
        let thumbnailPath: string | null = null;
        const thumbs = playerData.videoDetails?.thumbnail?.thumbnails || [];
        if (thumbs.length) {
            const thumbUrl = thumbs[thumbs.length - 1].url;
            try {
                const resp = await page.goto(thumbUrl, { timeout: 15000 });
                if (resp) {
                    const buffer = await resp.buffer();
                    thumbnailPath = path.join(tmpDir, `thumb-${timestamp}.jpg`);
                    await fs.promises.writeFile(thumbnailPath, buffer);
                }
            } catch (e) {
                console.warn('Failed to download thumbnail:', e);
            }
        }

        return {
            info: playerData,
            audioPath,
            thumbnailPath
        };
    } finally {
        try { await browser.close(); } catch (e) { /* ignore */ }
    }
}

// yt-dlp with Cookies (NO ACCOUNT, NO BAN RISK!)
async function ytDlpWithCookies(videoUrl: string, timestamp: number, tmpDir: string) {
    console.log('🍪 Attempting yt-dlp with anonymous cookies...');

    // Cookie file path - works in both dev and production
    const cookiePath = process.env.YOUTUBE_COOKIES_PATH || '/app/config/youtube_anon.txt';

    // Check if cookie file exists
    if (!fs.existsSync(cookiePath)) {
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

// yt-dlp with PO Token extraction (FALLBACK - no cookies)
async function ytDlpWithPoToken(videoUrl: string, timestamp: number, tmpDir: string) {
    console.log('Attempting yt-dlp with PO token extraction...');

    // Try to extract PO token
    const tokens = await extractPoTokenFromPage(videoUrl);

    // Get video info first
    const infoArgs = ['--dump-json', '--no-warnings'];
    if (tokens) {
        console.log('✅ Using extracted PO token');
        infoArgs.push('--extractor-args', `youtube:player_client=android,web;po_token=${tokens.poToken};visitor_data=${tokens.visitorData}`);
    } else {
        console.log('⚠️ Could not extract PO token, using alternative client');
        infoArgs.push('--extractor-args', 'youtube:player_client=android,ios');
    }
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
        '-o', path.join(tmpDir, `audio-${timestamp}.%(ext)s`),
        '--no-warnings'
    ];

    if (tokens) {
        downloadArgs.push('--extractor-args', `youtube:player_client=android,web;po_token=${tokens.poToken};visitor_data=${tokens.visitorData}`);
    } else {
        downloadArgs.push('--extractor-args', 'youtube:player_client=android,ios');
    }

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

        // Try Invidious first, fall back to youtube-search-api
        let formatted;
        try {
            const invResults = await searchViaInvidious(query, 20);
            formatted = invResults.map((item: any) => ({
                videoId: item.videoId,
                title: item.title,
                channelName: item.channelName,
                thumbnail: item.thumbnail,
                duration: item.duration ? `${Math.floor(item.duration / 60)}:${String(item.duration % 60).padStart(2, '0')}` : 'N/A',
                description: item.description || ''
            }));
        } catch (invError) {
            console.warn('Invidious search failed, using youtube-search-api:', invError);
            // Fallback to original method
            const results = await yts.GetListByKeyword(query, false, 20);
            formatted = results.items.map((item: any) => ({
                videoId: item.id,
                title: item.title,
                channelName: item.channelTitle,
                thumbnail: item.thumbnail.thumbnails[item.thumbnail.thumbnails.length - 1].url,
                duration: item.length?.simpleText || 'N/A',
                description: item.description || ''
            }));
        }

        res.json({ data: formatted });
    } catch (error: any) {
        console.error('Search error:', error);
        res.status(500).json({ error: 'Search failed' });
    }
};

// Download endpoint with NEW priority: Invidious → Puppeteer → yt-dlp → ytdl-core
const downloadHandler: RequestHandler = async (req, res) => {
    try {
        const { videoId } = req.body;
        if (!videoId) {
            res.status(400).json({ error: 'Video ID required' });
            return;
        }

        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
        const timestamp = Date.now();
        const tmpDir = os.tmpdir();

        console.log('🎬 Starting download for:', videoUrl);

        let result: any = null;
        let method = '';

        // Try methods in sequence (flat structure to avoid nested try/catch mismatches)
        try {
            console.log('📍 Trying Method 1: yt-dlp with Cookies...');
            result = await ytDlpWithCookies(videoUrl, timestamp, tmpDir);
            method = 'yt-dlp-cookies';
            console.log('✅ yt-dlp with cookies successful!');
        } catch (err) {
            console.warn('⚠️ yt-dlp cookies failed, will try other methods...', err);
        }

        if (!result) {
            try {
                console.log('📍 Trying Method 2: Invidious API...');
                result = await downloadViaInvidious(videoId, timestamp, tmpDir);
                method = 'invidious';
                console.log('✅ Invidious download successful!');
            } catch (err) {
                console.warn('⚠️ Invidious failed, will try other methods...', err);
            }
        }

        if (!result) {
            try {
                console.log('📍 Trying Method 3: yt-dlp with PO Token...');
                result = await ytDlpWithPoToken(videoUrl, timestamp, tmpDir);
                method = 'yt-dlp-potoken';
                console.log('✅ yt-dlp with PO token successful!');
            } catch (err) {
                console.warn('⚠️ yt-dlp PO token failed, will try other methods...', err);
            }
        }

        if (!result) {
            try {
                console.log('📍 Trying Method 4: Enhanced Puppeteer...');
                result = await puppeteerExtraction(videoUrl, timestamp, tmpDir);
                method = 'puppeteer';
                console.log('✅ Puppeteer extraction successful!');
            } catch (err) {
                console.warn('⚠️ Puppeteer failed, will try other methods...', err);
            }
        }

        if (!result) {
            try {
                console.log('📍 Trying Method 5: ytdl-core...');
                const info = await ytdl.getInfo(videoUrl);

                // Download audio
                const audioPath = path.join(tmpDir, `audio-${timestamp}.mp3`);
                const audioStream = ytdl(videoUrl, { quality: 'highestaudio', filter: 'audioonly' });

                await new Promise<void>((resolve, reject) => {
                    (ffmpeg as any)(audioStream)
                        .audioBitrate(128)
                        .format('mp3')
                        .on('error', reject)
                        .on('end', resolve)
                        .save(audioPath);
                });

                // Download thumbnail
                let thumbnailPath: string | null = null;
                const thumbs = info.videoDetails.thumbnails || [];
                if (thumbs.length) {
                    try {
                        const response = await fetch(thumbs[thumbs.length - 1].url);
                        const buffer = Buffer.from(await response.arrayBuffer());
                        thumbnailPath = path.join(tmpDir, `thumb-${timestamp}.jpg`);
                        await fs.promises.writeFile(thumbnailPath, buffer);
                    } catch (e) {
                        console.warn('Thumbnail download failed (ytdl):', e);
                    }
                }

                result = {
                    info: info,
                    audioPath,
                    thumbnailPath
                };
                method = 'ytdl-core';
                console.log('✅ ytdl-core successful!');
            } catch (err) {
                console.warn('⚠️ ytdl-core failed:', err);
            }
        }

        if (!result || !result.audioPath) {
            throw new Error('Download failed - no audio file created');
        }

        // Check file size
        const stats = fs.statSync(result.audioPath);
        if (stats.size > 50 * 1024 * 1024) {
            try { fs.unlinkSync(result.audioPath); } catch (e) { /* ignore */ }
            res.status(400).json({ error: 'File too large (>50MB)' });
            return;
        }

        // Extract metadata based on method
        let metadata: any;
        if (method === 'invidious' || method === 'puppeteer') {
            const vd = result.info.videoDetails;
            metadata = {
                title: vd?.title || '',
                artist: vd?.author || vd?.channelId || '',
                duration: parseInt(vd?.lengthSeconds || '0', 10),
                description: vd?.shortDescription || vd?.uploadDate || ''
            };
        } else if (method === 'yt-dlp-potoken' || method === 'yt-dlp-cookies') {
            metadata = {
                title: result.info.title || '',
                artist: result.info.uploader || result.info.channel || '',
                duration: parseInt(result.info.duration || '0', 10),
                description: result.info.description || ''
            };
        } else {
            const vd = result.info.videoDetails || {};
            metadata = {
                title: vd.title || '',
                artist: (vd.author && vd.author.name) || vd.author || '',
                duration: parseInt(vd.lengthSeconds || '0', 10),
                description: vd.description || ''
            };
        }

        console.log(`✅ Download complete using ${method}`);

        res.json({
            audioPath: result.audioPath,
            thumbnailPath: result.thumbnailPath || null,
            metadata,
            method // For debugging
        });

    } catch (error: any) {
        console.error('Download error:', error);
        res.status(500).json({
            error: 'Download failed',
            message: error?.message || String(error)
        });
    }
};

router.post('/search', searchHandler);
router.post('/download', downloadHandler);

export default router;
