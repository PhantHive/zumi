// server/src/routes/youtubeRoutes.ts
import { Router, Request, Response } from 'express';
import auth from '../middlewares/auth.js';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const router = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * GET /api/youtube/search
 * Search YouTube videos using Python yt-dlp
 */
router.get('/search', auth, async (req: Request, res: Response) => {
    try {
        // Extract query parameters with proper type handling
        const q = req.query.q as string | undefined;
        const limitStr = req.query.limit as string | undefined;

        if (!q || !q.trim()) {
            res.status(400).json({ error: 'Search query is required' });
            return;
        }

        const maxResults = Math.min(parseInt(limitStr || '10', 10) || 10, 50);
        const scriptPath = path.resolve(process.cwd(), 'server', 'tools', 'youtube_search.py');

        const results = await searchYouTubeWithPython(q, maxResults, scriptPath);
        res.json({ data: results });
    } catch (error: any) {
        console.error('YouTube search error:', error);
        res.status(500).json({
            error: 'YouTube search failed',
            message: error.message
        });
    }
});

/**
 * Helper function to call Python search script
 */
function searchYouTubeWithPython(query: string, limit: number, scriptPath: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
        const py = spawn(process.env.PYTHON || 'python3', [scriptPath], {
            stdio: ['pipe', 'pipe', 'pipe']
        });

        const payload = {
            query,
            limit
        };

        let stdout = '';
        let stderr = '';

        py.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        py.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        py.on('close', (code) => {
            if (stderr && stderr.trim().length) {
                console.warn('Python search stderr:', stderr);
            }

            if (code !== 0) {
                reject(new Error(`Python search script exited with code ${code}: ${stderr}`));
                return;
            }

            try {
                const results = JSON.parse(stdout);
                if (results.error) {
                    reject(new Error(results.error));
                } else {
                    resolve(results.results || results || []);
                }
            } catch (e) {
                reject(new Error(`Failed parsing Python output: ${e}\nstdout: ${stdout}\nstderr: ${stderr}`));
            }
        });

        py.on('error', (err) => {
            reject(new Error(`Failed to spawn Python process: ${err.message}`));
        });

        // Send JSON payload to Python script
        py.stdin.write(JSON.stringify(payload));
        py.stdin.end();
    });
}

export default router;