import { Router, RequestHandler } from 'express';
import multer from 'multer';
import path from 'path';
import { songController } from '../controllers/songController';

const router = Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dest = file.fieldname === 'thumbnail'
      ? './public/uploads/thumbnails'
      : './uploads';
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

export default router;