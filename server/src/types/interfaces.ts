import { Song } from '../../../shared/types/common';

export interface SongUpload {
  title: string;
  artist: string;
  audio: Express.Multer.File;
}

export interface DatabaseConfig {
  filename: string;
}

export interface SongRepository {
  findAll(): Promise<Song[]>;
  findById(id: number): Promise<Song | null>;
  create(song: Partial<Song>): Promise<Song>;
  delete(id: number): Promise<boolean>;
}