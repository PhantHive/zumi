export const getAssetPath = (filename: string): string => {
    const isDev = process.env.NODE_ENV === 'development';
    return isDev ? `/public/${filename}` : `./public/${filename}`;
};
