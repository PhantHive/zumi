// Declaration shims for third-party packages without TypeScript types
declare module 'fluent-ffmpeg';

// Some packages expose CommonJS exports; allow importing them as any
declare module 'fluent-ffmpeg' {
    const content: any;
    export = content;
}
