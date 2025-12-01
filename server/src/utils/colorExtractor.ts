import * as Vibrant from 'node-vibrant';
import path from 'path';
import fs from 'fs';

interface ColorPalette {
    background: string;
    primary: string;
    secondary: string;
    detail: string;
    vibrant: string;
    muted: string;
}

// Simple in-memory cache
const colorCache = new Map<string, ColorPalette>();

// File-based cache path
const getCachePath = (isDev: boolean): string => {
    const PROJECT_ROOT = path.resolve(process.cwd());
    return isDev
        ? path.join(PROJECT_ROOT, 'public', 'uploads', '.color-cache.json')
        : '/app/uploads/.color-cache.json';
};

// Load cache from file
const loadCache = (isDev: boolean): void => {
    try {
        const cachePath = getCachePath(isDev);
        if (fs.existsSync(cachePath)) {
            const data = fs.readFileSync(cachePath, 'utf-8');
            const cached = JSON.parse(data);
            Object.entries(cached).forEach(([key, value]) => {
                colorCache.set(key, value as ColorPalette);
            });
        }
    } catch (error) {
        console.error('Error loading color cache:', error);
    }
};

// Save cache to file
const saveCache = (isDev: boolean): void => {
    try {
        const cachePath = getCachePath(isDev);
        const cacheDir = path.dirname(cachePath);

        // Ensure directory exists
        if (!fs.existsSync(cacheDir)) {
            fs.mkdirSync(cacheDir, { recursive: true });
        }

        const cacheObject = Object.fromEntries(colorCache);
        fs.writeFileSync(cachePath, JSON.stringify(cacheObject, null, 2));
    } catch (error) {
        console.error('Error saving color cache:', error);
    }
};

// Initialize cache on module load
const isDev = process.env.NODE_ENV === 'development';
loadCache(isDev);

export const extractColors = async (
    imagePath: string,
    filename: string,
): Promise<ColorPalette> => {
    // Check cache first
    if (colorCache.has(filename)) {
        return colorCache.get(filename)!;
    }

    try {
        // Extract color palette using Vibrant
        const palette = await Vibrant.from(imagePath).getPalette();

        // Convert to hex colors with fallbacks
        const toHex = (rgb: number[] | undefined): string => {
            if (!rgb) return '#1a1a2e'; // Default dark background
            return `#${rgb.map((x) => Math.round(x).toString(16).padStart(2, '0')).join('')}`;
        };

        const colorPalette: ColorPalette = {
            background:
                toHex(palette.DarkMuted?.rgb) ||
                toHex(palette.Muted?.rgb) ||
                '#1a1a2e',
            primary:
                toHex(palette.Vibrant?.rgb) ||
                toHex(palette.LightVibrant?.rgb) ||
                '#6e4f8f',
            secondary:
                toHex(palette.DarkVibrant?.rgb) ||
                toHex(palette.DarkMuted?.rgb) ||
                '#4a3a6e',
            detail:
                toHex(palette.LightVibrant?.rgb) ||
                toHex(palette.LightMuted?.rgb) ||
                '#8e6faf',
            vibrant: toHex(palette.Vibrant?.rgb) || '#9370db',
            muted: toHex(palette.Muted?.rgb) || '#5a4a6e',
        };

        // Cache the result
        colorCache.set(filename, colorPalette);
        saveCache(isDev);

        return colorPalette;
    } catch (error) {
        console.error('Error extracting colors:', error);
        // Return default palette on error
        return {
            background: '#1a1a2e',
            primary: '#6e4f8f',
            secondary: '#4a3a6e',
            detail: '#8e6faf',
            vibrant: '#9370db',
            muted: '#5a4a6e',
        };
    }
};

export const clearColorCache = (): void => {
    colorCache.clear();
    saveCache(isDev);
};

export const removeCachedColor = (filename: string): void => {
    colorCache.delete(filename);
    saveCache(isDev);
};
