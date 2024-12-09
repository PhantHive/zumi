import { Schema, model, Types } from 'mongoose';
import { BaseDocument, IModelBase } from "../types/mongotypes";

export interface ISong extends BaseDocument {
  title: string;
  artist: string;
  duration: number;
  filepath: string;
  thumbnailUrl?: string;
  albumId: string;
  uploadedBy: Types.ObjectId;
}

const songSchema = new Schema<ISong>(
  {
    title: {
      type: String,
      required: true
    },
    artist: {
      type: String,
      required: true
    },
    duration: {
      type: Number,
      required: true
    },
    filepath: {
      type: String,
      required: true
    },
    thumbnailUrl: {
      type: String
    },
    albumId: {
      type: String,
      required: true
    },
    uploadedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_, ret) => {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      }
    }
  }
);

songSchema.statics.build = function(attrs: Omit<ISong, keyof BaseDocument>) {
  return new Song(attrs);
};

export const Song = model<ISong, IModelBase<ISong>>('Song', songSchema);