import sharp from 'sharp';
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

// Helper function to calculate color luminance
const getLuminance = (r: number, g: number, b: number): number => {
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

// Helper function to calculate color saturation
const getSaturation = (r: number, g: number, b: number): number => {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    return max === 0 ? 0 : (max - min) / max;
};

// Helper function to adjust color brightness
const adjustBrightness = (rgb: number[], factor: number): number[] => {
    return rgb.map((c) => Math.min(255, Math.max(0, Math.round(c * factor))));
};

// Helper function to adjust color saturation
const adjustSaturation = (rgb: number[], factor: number): number[] => {
    const [r, g, b] = rgb;
    const gray = 0.2989 * r + 0.587 * g + 0.114 * b;
    return [
        Math.min(255, Math.max(0, Math.round(gray + (r - gray) * factor))),
        Math.min(255, Math.max(0, Math.round(gray + (g - gray) * factor))),
        Math.min(255, Math.max(0, Math.round(gray + (b - gray) * factor))),
    ];
};

// Convert RGB array to hex string
const rgbToHex = (rgb: number[]): string => {
    return `#${rgb.map((x) => Math.round(x).toString(16).padStart(2, '0')).join('')}`;
};

export const extractColors = async (
    imagePath: string,
    filename: string,
): Promise<ColorPalette> => {
    // Check cache first
    if (colorCache.has(filename)) {
        return colorCache.get(filename)!;
    }

    try {
        // Resize image to 64x64 for faster processing and get raw pixel data
        const { data } = await sharp(imagePath)
            .resize(64, 64, { fit: 'cover' })
            .raw()
            .toBuffer({ resolveWithObject: true });

        // Extract color palette by sampling pixels
        const pixels: Array<[number, number, number]> = [];
        for (let i = 0; i < data.length; i += 4) {
            pixels.push([data[i], data[i + 1], data[i + 2]]);
        }

        // Find dominant colors by clustering
        const dominantColor = pixels.reduce(
            (acc, pixel) => {
                return [
                    acc[0] + pixel[0],
                    acc[1] + pixel[1],
                    acc[2] + pixel[2],
                ];
            },
            [0, 0, 0],
        );

        const avgColor: [number, number, number] = [
            Math.round(dominantColor[0] / pixels.length),
            Math.round(dominantColor[1] / pixels.length),
            Math.round(dominantColor[2] / pixels.length),
        ];

        // Sort pixels by saturation to find vibrant colors
        const sortedBySaturation = pixels
            .filter((p) => {
                const lum = getLuminance(p[0], p[1], p[2]);
                return lum > 20 && lum < 235; // Exclude very dark/light
            })
            .sort((a, b) => {
                return (
                    getSaturation(b[0], b[1], b[2]) -
                    getSaturation(a[0], a[1], a[2])
                );
            });

        const vibrantColor = sortedBySaturation[0] || avgColor;

        // Sort pixels by luminance to find dark/light colors
        const sortedByLuminance = pixels.sort((a, b) => {
            return (
                getLuminance(a[0], a[1], a[2]) - getLuminance(b[0], b[1], b[2])
            );
        });

        const darkColor = sortedByLuminance[0] || avgColor;
        const lightColor =
            sortedByLuminance[sortedByLuminance.length - 1] || avgColor;

        // Generate color palette
        const colorPalette: ColorPalette = {
            background: rgbToHex(adjustBrightness(Array.from(darkColor), 0.8)),
            primary: rgbToHex(Array.from(vibrantColor)),
            secondary: rgbToHex(adjustBrightness(Array.from(avgColor), 0.7)),
            detail: rgbToHex(Array.from(lightColor)),
            vibrant: rgbToHex(adjustSaturation(Array.from(vibrantColor), 1.2)),
            muted: rgbToHex(adjustSaturation(Array.from(avgColor), 0.6)),
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
