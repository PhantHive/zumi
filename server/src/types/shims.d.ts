// ...existing code...

// Declaration shims for third-party packages without TypeScript types
declare module 'youtube-search-api';
declare module 'fluent-ffmpeg';

// Some packages expose CommonJS exports; allow importing them as any
declare module 'youtube-search-api' {
    const content: any;
    export = content;
}

declare module 'fluent-ffmpeg' {
    const content: any;
    export = content;
}

// ...existing code...
