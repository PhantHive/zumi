import express from 'express';
import { Router, RequestHandler } from 'express';
import multer from 'multer';
import path from 'path';
import { songController } from '../controllers/songController';

const router = Router();
const app = express();

const isDev = process.env.NODE_ENV === 'development';

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dest = file.fieldname === 'thumbnail'
      ? (isDev ? './public/uploads/thumbnails' : '/app/uploads/thumbnails')
      : (isDev ? './public/data' : '/app/data');

    cb(null, dest);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}${path.extname(file.originalname)}`);
  }
});

const upload = multer({ storage });

const uploadFields = upload.fields([
  { name: 'audio', maxCount: 1 },
  { name: 'thumbnail', maxCount: 1 }
]) as RequestHandler;

router.get('/', songController.getAllSongs as RequestHandler);
router.get('/:id', songController.getSong as RequestHandler);
router.get('/:id/stream', songController.streamSong as RequestHandler);
router.post('/', uploadFields, songController.createSong as RequestHandler);

// Serve static files from /app/uploads
app.use('/uploads', express.static('/app/uploads'));
app.use('/data', express.static('/app/data'));

// Add a route to serve thumbnails
router.get('/thumbnails/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join('/app/uploads/thumbnails', filename);
  res.sendFile(filePath, (err) => {
    if (err) {
      res.status(404).send('Thumbnail not found');
    }
  });
});

export default router;