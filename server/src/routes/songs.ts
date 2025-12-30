// server/src/routes/songs.ts
import { Router } from 'express';
import { songController } from '../controllers/songController.js';
import auth from '../middlewares/auth.js';
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
    },
    production: {
        thumbnails: '/app/uploads/thumbnails',
        audio: '/app/data',
    },
};

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const paths = isDev
            ? UPLOAD_PATHS.development
            : UPLOAD_PATHS.production;
        const dest =
            file.fieldname === 'thumbnail' ? paths.thumbnails : paths.audio;
        fs.mkdirSync(dest, { recursive: true });
        cb(null, dest);
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}${path.extname(file.originalname)}`);
    },
});

const upload = multer({ storage });

// Routes
router.use(auth);

router.get('/', songController.getAllSongs);
router.get('/artists', songController.getArtists);
router.get('/albums', songController.getAlbums);
router.get('/my-uploads', songController.getMyUploads);
router.get('/liked', songController.getLikedSongs);

router.get('/:id', songController.getSong);
router.get('/:id/stream', songController.streamSong);
router.post('/:id/like', songController.toggleLike);
router.patch('/:id/visibility', songController.updateVisibility);
router.delete('/:id', songController.deleteSong);
router.post(
    '/',
    upload.fields([
        { name: 'audio', maxCount: 1 },
        { name: 'thumbnail', maxCount: 1 },
    ]),
    songController.createSong,
);

// Add update route for song metadata and optional file replacements
router.patch(
    '/:id',
    upload.fields([
        { name: 'audio', maxCount: 1 },
        { name: 'thumbnail', maxCount: 1 },
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

export const staticPaths = {
    uploads: isDev
        ? path.join(PROJECT_ROOT, 'public', 'uploads')
        : '/app/uploads',
    data: isDev ? path.join(PROJECT_ROOT, 'public', 'data') : '/app/data',
};

export default router;
