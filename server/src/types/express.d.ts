import { IUser } from '../models/User';

declare global {
    namespace Express {
        interface Request {
            user?: IUser;
            file?: Multer.File;
            files?:
                | {
                      [fieldname: string]: Multer.File[];
                  }
                | Multer.File[];
            headers: {
                authorization?: string;
            } & Request['headers'];
        }
    }
}
