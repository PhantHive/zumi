import { Router, RequestHandler } from 'express';
import ytdl from '@distube/ytdl-core';
import yts from 'youtube-search-api';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile as execFileCb } from 'child_process';
import puppeteer from 'puppeteer-core';

const router = Router();

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

// ✨ NEW: Extract PO Token from YouTube page (NO COOKIES NEEDED!)
async function extractPoTokenFromPage(videoUrl: string): Promise<{ visitorData: string; poToken: string } | null> {
    const exe = findChromeExecutable();
    if (!exe) return null;

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
                // @ts-ignore
                const ytcfg = window.ytcfg;
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

// ✨ IMPROVED: Enhanced Puppeteer extraction with better headers
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

        // Wait a bit for player to initialize
        await page.waitForTimeout(2000);

        // Extract player response
        const playerData = await page.evaluate(() => {
            try {
                // @ts-ignore
                if (window.ytInitialPlayerResponse) {
                    return window.ytInitialPlayerResponse;
                }
                // @ts-ignore
                if (window.ytplayer?.config?.args?.player_response) {
                    return JSON.parse(window.ytplayer.config.args.player_response);
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

// ✨ IMPROVED: Use yt-dlp with PO Token and extractor args (NO COOKIES!)
async function ytDlpWithPoToken(videoUrl: string, timestamp: number, tmpDir: string) {
    console.log('Attempting yt-dlp with PO token extraction...');

    // First, try to extract PO token using Puppeteer
    let poTokenArgs: string[] = [];
    try {
        const tokens = await extractPoTokenFromPage(videoUrl);
        if (tokens && tokens.visitorData && tokens.poToken) {
            console.log('✅ Extracted PO Token successfully!');
            poTokenArgs = [
                '--extractor-args',
                `youtube:player_client=android,web;po_token=${tokens.poToken};visitor_data=${tokens.visitorData}`
            ];
        } else {
            console.log('⚠️ Could not extract PO token, using alternative client');
            // Fallback: Use Android client which has fewer restrictions
            poTokenArgs = [
                '--extractor-args',
                'youtube:player_client=android,ios'
            ];
        }
    } catch (e) {
        console.warn('PO token extraction failed, using android client:', e);
        poTokenArgs = [
            '--extractor-args',
            'youtube:player_client=android,ios'
        ];
    }

    // Get video info first
    const jsonCmd = ['-j', ...poTokenArgs, videoUrl];
    let infoJson: any;

    try {
        const out = await runExecFile('yt-dlp', jsonCmd, { maxBuffer: 10 * 1024 * 1024 });
        infoJson = JSON.parse(out.stdout);
    } catch (e: any) {
        const stderr = String(e?.stderr || e?.stdout || e?.message || e);
        console.error('yt-dlp info extraction failed:', stderr);
        throw new Error('Failed to get video info: ' + stderr);
    }

    // Download audio
    const audioTemplate = path.join(tmpDir, `audio-${timestamp}.%(ext)s`);
    const downloadArgs = [
        ...poTokenArgs,
        '-x',
        '--audio-format', 'mp3',
        '--audio-quality', '128K',
        '--no-post-overwrites',
        '--embed-thumbnail',
        '--add-metadata',
        '-o', audioTemplate,
        videoUrl
    ];

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

// Search endpoint (unchanged)
const searchHandler: RequestHandler = async (req, res) => {
    try {
        const { query } = req.body;
        if (!query) {
            res.status(400).json({ error: 'Query required' });
            return;
        }

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

// ✨ COMPLETELY REWRITTEN Download endpoint - NO COOKIES!
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

        // ✨ STRATEGY: Try methods in order of reliability (NO COOKIES!)
        // 1. Enhanced Puppeteer (most reliable, no cookies needed)
        // 2. yt-dlp with PO Token (good fallback)
        // 3. ytdl-core (fast but often blocked)

        let result: any = null;
        let method = '';

        // Method 1: Enhanced Puppeteer (BEST - NO COOKIES)
        try {
            console.log('📍 Trying Method 1: Enhanced Puppeteer...');
            result = await puppeteerExtraction(videoUrl, timestamp, tmpDir);
            method = 'puppeteer';
            console.log('✅ Puppeteer extraction successful!');
        } catch (puppeteerErr) {
            console.warn('⚠️ Puppeteer failed, trying yt-dlp...', puppeteerErr);

            // Method 2: yt-dlp with PO Token (GOOD FALLBACK - NO COOKIES)
            try {
                console.log('📍 Trying Method 2: yt-dlp with PO Token...');
                result = await ytDlpWithPoToken(videoUrl, timestamp, tmpDir);
                method = 'yt-dlp-potoken';
                console.log('✅ yt-dlp with PO token successful!');
            } catch (ytdlpErr) {
                console.warn('⚠️ yt-dlp failed, trying ytdl-core...', ytdlpErr);

                // Method 3: ytdl-core (LAST RESORT)
                try {
                    console.log('📍 Trying Method 3: ytdl-core...');
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
                        const response = await fetch(thumbs[thumbs.length - 1].url);
                        const buffer = Buffer.from(await response.arrayBuffer());
                        thumbnailPath = path.join(tmpDir, `thumb-${timestamp}.jpg`);
                        await fs.promises.writeFile(thumbnailPath, buffer);
                    }

                    result = {
                        info: info,
                        audioPath,
                        thumbnailPath
                    };
                    method = 'ytdl-core';
                    console.log('✅ ytdl-core successful!');
                } catch (ytdlErr) {
                    console.error('❌ ALL METHODS FAILED');
                    throw new Error('All download methods failed. Video may be restricted or age-gated.');
                }
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
        if (method === 'puppeteer') {
            const vd = result.info.videoDetails;
            metadata = {
                title: vd?.title || '',
                artist: vd?.author || vd?.channelId || '',
                duration: parseInt(vd?.lengthSeconds || '0', 10),
                description: vd?.shortDescription || ''
            };
        } else if (method === 'yt-dlp-potoken') {
            metadata = {
                title: result.info.title || '',
                artist: result.info.uploader || result.info.channel || '',
                duration: parseInt(result.info.duration || '0', 10),
                description: result.info.description || ''
            };
        } else {
            const vd = result.info.videoDetails;
            metadata = {
                title: vd.title || '',
                artist: vd.author?.name || '',
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