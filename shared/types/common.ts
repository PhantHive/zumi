export interface Song {
    id: number;
    title: string;
    artist: string;
    genre?: string;
    duration?: number;
    filepath: string;
    albumId: string;
    thumbnailUrl?: string;
    uploadedBy?: string;
    visibility?: 'public' | 'private';
    year?: number;
    bpm?: number;
    mood?: string;
    language?: string;
    lyrics?: string;
    playCount?: number;
    likedBy?: string[];
    tags?: string[];
}

export interface Album {
    id: string;
    name: string;
    coverImage?: string;
    songs: Song[];
}

export const GENRES = [
    'Epic Rap',
    'K-Pop',
    'Lo-fi Emotional',
    'Inspirational Pop',
    'Ambient Cinematic',
] as const;

export type Genre = (typeof GENRES)[number];
