import { Request as ExpressRequest } from 'express';
import { Multer } from 'multer';

declare global {
  namespace Express {
    interface Request extends ExpressRequest {
      file?: Multer.File;
      files?: {
        [fieldname: string]: Multer.File[];
      } | Multer.File[];
    }
  }
}

export {};