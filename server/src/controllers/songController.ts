import { Request, Response, RequestHandler } from 'express';
import { getAudioDurationInSeconds } from 'get-audio-duration';
import path from 'path';
import { db } from '../utils/db';
import { Song } from '../../../shared/types/common';
import * as fs from "node:fs";

type MulterRequest = Request & {
  files?: {
    [fieldname: string]: Express.Multer.File[];
  };
};

export class SongController {
  getAllSongs: RequestHandler = async (_req, res) => {
    try {
      const songs = await db.getAllSongs();
      res.json({ data: songs });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch songs' });
    }
  };

  getSong: RequestHandler = async (req, res) => {
    try {
      const song = await db.getSongById(parseInt(req.params.id));
      if (!song) {
        res.status(404).json({ error: 'Song not found' });
        return;
      }
      res.json({ data: song });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch song' });
    }
  };

    createSong: RequestHandler = async (req, res) => {
    try {
      const multerReq = req as MulterRequest;
      const audioFile = multerReq.files?.['audio']?.[0];
      if (!audioFile) {
        res.status(400).json({ error: 'No audio file provided' });
        return;
      }

      const isDev = process.env.NODE_ENV === 'development';
      const baseMusicPath = isDev ? './public/data' : '/app/data';
      const baseThumbnailPath = isDev ? './public/uploads/thumbnails' : '/app/uploads/thumbnails';

      // Ensure directories exist
      await fs.promises.mkdir(baseMusicPath, { recursive: true });
      await fs.promises.mkdir(baseThumbnailPath, { recursive: true });

      const duration = await getAudioDurationInSeconds(audioFile.path);
      console.log('Audio duration:', duration);

      let thumbnailUrl: string | undefined = undefined;
      if (multerReq.files?.['thumbnail']?.[0]) {
        const thumbnail = multerReq.files['thumbnail'][0];
        // Save thumbnail in the appropriate folder
        const tempThumbnailPath = thumbnail.path;
        const publicThumbnailPath = path.join(baseThumbnailPath, thumbnail.filename);
        console.log('Temporary thumbnail path:', tempThumbnailPath); // Debug log
        console.log('Public thumbnail path:', publicThumbnailPath); // Debug log
        await fs.promises.copyFile(tempThumbnailPath, publicThumbnailPath);
        console.log('Thumbnail copied to:', publicThumbnailPath); // Debug log
        await fs.promises.unlink(tempThumbnailPath);
        console.log('Temporary thumbnail deleted:', tempThumbnailPath); // Debug log
        thumbnailUrl = `${thumbnail.filename}`;
      }

      const song: Partial<Song> = {
        title: req.body.title || path.parse(audioFile.originalname).name,
        artist: req.body.artist || 'Unknown Artist',
        duration: Math.floor(duration),
        albumId: req.body.album || 'Unknown Album',
        filepath: path.join(baseMusicPath, audioFile.filename),
        thumbnailUrl: thumbnailUrl || 'placeholder.jpg'
      };

      const newSong = await db.createSong(song);
      res.status(201).json({ data: newSong });
    } catch (error) {
      console.error('Error creating song:', error);
      res.status(500).json({ error: 'Failed to create song' });
    }
  };


  streamSong: RequestHandler = async (req, res) => {
    try {
      const song = await db.getSongById(parseInt(req.params.id));
      if (!song) {
        res.status(404).json({ error: 'Song not found' });
        return;
      }
      res.sendFile(path.resolve(song.filepath));
    } catch (error) {
      res.status(500).json({ error: 'Failed to stream song' });
    }
  };
}

export const songController = new SongController();