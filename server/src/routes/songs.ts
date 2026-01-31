import { Router, Request, Response, NextFunction } from 'express';
import { songController } from '../controllers/songController.js';
import auth, { optionalAuth } from '../middlewares/auth.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { extractColors } from '../utils/colorExtractor.js';

const router = Router();
const isDev = process.env.NODE_ENV === 'development';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

const UPLOAD_PATHS = {
    development: {
        thumbnails: path.join(PROJECT_ROOT, 'public', 'uploads', 'thumbnails'),
        audio: path.join(PROJECT_ROOT, 'public', 'data'),
        videos: path.join(PROJECT_ROOT, 'public', 'uploads', 'videos'), // NEW: Video storage path
    },
    production: {
        thumbnails: '/app/uploads/thumbnails',
        audio: '/app/data',
        videos: '/app/uploads/videos', // NEW: Video storage path
    },
};

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const paths = isDev
            ? UPLOAD_PATHS.development
            : UPLOAD_PATHS.production;

        // NEW: Determine destination based on file field
        let dest: string;
        if (file.fieldname === 'thumbnail') {
            dest = paths.thumbnails;
        } else if (file.fieldname === 'video') {
            dest = paths.videos;
        } else {
            dest = paths.audio;
        }

        fs.mkdirSync(dest, { recursive: true });
        cb(null, dest);
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}${path.extname(file.originalname)}`);
    },
});

const upload = multer({ storage });

// Debug middleware for uploads: log headers and small metadata to help debug mobile upload failures
router.options('/', (req: Request, res: Response) => {
    // Allow preflight checks for the upload endpoint
    res.sendStatus(200);
});

const logUploadRequest = (req: Request, res: Response, next: NextFunction) => {
    try {
        console.log('Upload endpoint hit. Headers:', {
            origin: req.headers.origin,
            authorization: req.headers.authorization ? 'present' : 'missing',
            contentType: req.headers['content-type'],
            contentLength: req.headers['content-length'],
        });
    } catch (err) {
        console.error('Failed to log upload headers:', err);
    }
    next();
};

// Routes without global auth - apply auth individually

// Video streaming endpoint - uses optional auth to accept token from query params
router.get('/:id/stream-video', optionalAuth, songController.streamVideo);

// Regular routes with auth
router.get('/', auth, songController.getAllSongs);
router.get('/artists', auth, songController.getArtists);
router.get('/albums', auth, songController.getAlbums);
router.get('/genres', auth, songController.getGenres);
router.get('/my-uploads', auth, songController.getMyUploads);
router.get('/liked', auth, songController.getLikedSongs);

router.get('/:id', auth, songController.getSong);
router.get('/:id/stream', auth, songController.streamSong);
router.post('/:id/like', auth, songController.toggleLike);
router.patch('/:id/visibility', auth, songController.updateVisibility);
router.delete('/:id', auth, songController.deleteSong);

// Simple administrative delete route: DELETE /api/songs/:id/row
// Removes the song row by id regardless of uploader. Keep protected by auth middleware.
router.delete('/:id/row', auth, songController.deleteSongRow);

router.post(
    '/',
    auth,
    logUploadRequest,
    upload.fields([
        { name: 'audio', maxCount: 1 },
        { name: 'thumbnail', maxCount: 1 },
        { name: 'video', maxCount: 1 }, // NEW: Video upload field
    ]),
    songController.createSong,
);

// Add update route for song metadata and optional file replacements
router.patch(
    '/:id',
    auth,
    upload.fields([
        { name: 'audio', maxCount: 1 },
        { name: 'thumbnail', maxCount: 1 },
        { name: 'video', maxCount: 1 }, // NEW: Video upload field for updates
    ]),
    songController.updateSong,
);

router.get('/thumbnails/:filename', (req, res) => {
    const { filename } = req.params;
    const paths = isDev ? UPLOAD_PATHS.development : UPLOAD_PATHS.production;
    const filePath = path.join(paths.thumbnails, filename);

    if (!fs.existsSync(filePath)) {
        res.status(404).send('Thumbnail not found');
        return;
    }

    res.sendFile(filePath, (err) => {
        if (err) {
            console.error('Error serving thumbnail:', err);
            if (!res.headersSent) {
                res.status(500).send('Error serving thumbnail');
            }
        }
    });
});

// NEW: Video serving endpoint
router.get('/videos/:filename', (req, res) => {
    const { filename } = req.params;
    const paths = isDev ? UPLOAD_PATHS.development : UPLOAD_PATHS.production;
    const filePath = path.join(paths.videos, filename);

    if (!fs.existsSync(filePath)) {
        res.status(404).send('Video not found');
        return;
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');

    if (range) {
        // Handle range requests for video streaming
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = (end - start) + 1;
        const file = fs.createReadStream(filePath, { start, end });
        const head = {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize,
            'Content-Type': 'video/mp4',
            'Cache-Control': 'public, max-age=0',
        };

        res.writeHead(206, head);

        file.on('error', (error) => {
            console.error('Video stream error:', error);
            if (!res.headersSent) {
                res.status(500).end();
            }
        });

        file.pipe(res);
    } else {
        // Send entire file
        const head = {
            'Content-Length': fileSize,
            'Content-Type': 'video/mp4',
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'public, max-age=0',
        };
        res.writeHead(200, head);

        const file = fs.createReadStream(filePath);

        file.on('error', (error) => {
            console.error('Video stream error:', error);
            if (!res.headersSent) {
                res.status(500).end();
            }
        });

        file.pipe(res);
    }
});

router.get('/thumbnails/:filename/colors', async (req, res) => {
    try {
        const { filename } = req.params;
        const paths = isDev
            ? UPLOAD_PATHS.development
            : UPLOAD_PATHS.production;
        const filePath = path.join(paths.thumbnails, filename);

        if (!fs.existsSync(filePath)) {
            res.status(404).json({ error: 'Thumbnail not found' });
            return;
        }

        const colors = await extractColors(filePath, filename);
        res.json(colors);
    } catch (error) {
        console.error('Error extracting colors:', error);
        res.status(500).json({ error: 'Failed to extract colors' });
    }
});

// New: return top genres for recommendations
// router.get('/genres', songController.getGenres);

export const staticPaths = {
    uploads: isDev
        ? path.join(PROJECT_ROOT, 'public', 'uploads')
        : '/app/uploads',
    data: isDev ? path.join(PROJECT_ROOT, 'public', 'data') : '/app/data',
    videos: isDev
        ? path.join(PROJECT_ROOT, 'public', 'uploads', 'videos')
        : '/app/uploads/videos', // NEW: Export video path
};

export default router;

