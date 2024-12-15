import { Document, Model } from 'mongoose';

export interface BaseDocument extends Document {
    createdAt: Date;
    updatedAt: Date;
}

export interface IModelBase<T extends BaseDocument> extends Model<T> {
    build(attrs: Omit<T, keyof BaseDocument>): T;
    findByGoogleId?(googleId: string): Promise<T | null>;
}
