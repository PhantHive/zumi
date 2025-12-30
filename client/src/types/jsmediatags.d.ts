declare module 'jsmediatags' {
    export interface Picture {
        data: number[];
        format: string;
        type: string;
        description: string;
    }

    export interface Tags {
        title?: string;
        artist?: string;
        album?: string;
        year?: number | string;
        genre?: string;
        picture?: Picture;
        lyrics?: string | { lyrics: string };
        [key: string]: unknown;
    }

    export interface TagReadResult {
        type: string;
        tags: Tags;
    }

    export interface ReadOptions {
        onSuccess: (tag: TagReadResult) => void;
        onError: (error: { type: string; info: string }) => void;
    }

    export interface JSMediaTags {
        read: (file: File | Blob | string, options: ReadOptions) => void;
    }

    const jsmediatags: JSMediaTags;
    export default jsmediatags;
}
