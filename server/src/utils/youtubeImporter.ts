import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { db } from './db.js';
import { Song } from '../../../shared/types/common.js';

interface YtResult {
    id?: string;
    title?: string;
    uploader?: string;
    duration?: number;
    audio_file?: string;
    thumbnail_file?: string | null;
    video_url?: string;
    error?: string;
    url?: string;
}

export async function downloadFromYoutube(urls: string[], uploaderEmail?: string) {
    const isDev = process.env.NODE_ENV === 'development';
    const baseMusicPath = isDev ? path.resolve(process.cwd(), 'public', 'data') : '/app/data';
    const baseThumbnailPath = isDev ? path.resolve(process.cwd(), 'public', 'uploads', 'thumbnails') : '/app/uploads/thumbnails';

    // Ensure directories
    fs.mkdirSync(baseMusicPath, { recursive: true });
    fs.mkdirSync(baseThumbnailPath, { recursive: true });

    const scriptPath = path.resolve(process.cwd(), 'server', 'tools', 'download_youtube.py');

    return new Promise<any[]>((resolve, reject) => {
        const py = spawn(process.env.PYTHON || 'python3', [scriptPath], { stdio: ['pipe', 'pipe', 'pipe'] });

        const payload = {
            urls,
            output_audio_dir: baseMusicPath,
            output_thumbnail_dir: baseThumbnailPath,
        };

        let stdout = '';
        let stderr = '';

        py.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        py.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        py.on('close', async (_code) => {
            if (stderr && stderr.trim().length) {
                console.warn('Python stderr:', stderr);
            }

            try {
                const results: YtResult[] = JSON.parse(stdout);
                const created: any[] = [];

                for (const r of results) {
                    if (r.error) {
                        created.push({ error: r.error, url: r.url });
                        continue;
                    }

                    // Move audio file if necessary (already in output dir)
                    const filepath = r.audio_file || '';
                    const filename = path.basename(filepath);

                    // Thumbnail
                    let thumbnailFilename: string | undefined = undefined;
                    if (r.thumbnail_file) {
                        thumbnailFilename = path.basename(r.thumbnail_file);
                    }

                    const song: Partial<Song> = {
                        title: r.title || filename.replace(/\.mp3$/, ''),
                        artist: r.uploader || 'Unknown',
                        duration: r.duration ? Math.floor(r.duration) : undefined,
                        filepath: path.join(baseMusicPath, filename),
                        thumbnailUrl: thumbnailFilename,
                        videoUrl: r.video_url,
                        uploadedBy: uploaderEmail || undefined,
                        visibility: 'public',
                    };

                    try {
                        const newSong = await db.createSong(song);
                        created.push({ data: newSong });
                    } catch (err) {
                        console.error('Failed creating DB row for', r, err);
                        created.push({ error: String(err), url: r.video_url });
                    }
                }

                resolve(created);
            } catch (e) {
                reject(new Error('Failed parsing python output: ' + e + '\nstdout:' + stdout + '\nstderr:' + stderr));
            }
        });

        // send JSON payload
        py.stdin.write(JSON.stringify(payload));
        py.stdin.end();
    });
}
