export interface Song {
    id: number;
    title: string;
    artist: string;
    duration?: number;
    filepath: string;
    albumId: string;
    thumbnailUrl?: string;
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
