import mongoose, { Schema } from 'mongoose';
import { BaseDocument, IModelBase } from '../types/mongotypes.js';

// Database name constant
const DATABASE_NAME = 'zumi';

export interface IUser extends BaseDocument {
    email: string;
    name: string;
    googleId: string;
    picture?: string;
    playlists: {
        name: string;
        songs: mongoose.Types.ObjectId[];
    }[];
    preferences: {
        theme: 'light' | 'dark';
        visualizerEnabled: boolean;
    };
}

export interface CreateUserDTO {
    email: string;
    name: string;
    googleId: string;
    picture?: string;
}

export interface UserModel extends IModelBase<IUser> {
    findByGoogleId(googleId: string): Promise<IUser | null>;
    createWithGoogle(userData: CreateUserDTO): Promise<IUser>;
}

const userSchema = new Schema<IUser>(
    {
        email: { type: String, required: true, unique: true },
        name: { type: String, required: true },
        googleId: { type: String, required: true, unique: true },
        picture: String,
        playlists: [
            {
                name: { type: String, required: true },
                songs: [{ type: Schema.Types.ObjectId, ref: 'Song' }],
            },
        ],
        preferences: {
            theme: {
                type: String,
                enum: ['light', 'dark'],
                default: 'dark',
            },
            visualizerEnabled: {
                type: Boolean,
                default: true,
            },
        },
    },
    {
        timestamps: true,
        versionKey: false,
        toJSON: {
            transform: (_, ret) => {
                ret.id = ret._id;
                delete ret._id;
                delete ret.__v;
                return ret;
            },
        },
    },
);

userSchema.statics.findByGoogleId = async function (
    googleId: string,
): Promise<IUser | null> {
    return this.findOne({ googleId });
};

userSchema.statics.createWithGoogle = async function (
    userData: CreateUserDTO,
): Promise<IUser> {
    return this.create({
        ...userData,
        preferences: {
            theme: 'dark',
            visualizerEnabled: true,
        },
        playlists: [],
    });
};

const User = mongoose.connection
    .useDb(DATABASE_NAME)
    .model<IUser, UserModel>('users', userSchema);

export default User;
