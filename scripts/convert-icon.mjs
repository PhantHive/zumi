import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sourceIcon = path.join(__dirname, '../public/images/zumi-z-logo.png');
const outputDir = path.join(__dirname, '../client/src/assets');
const publicOutputDir = path.join(__dirname, '../public/images');

async function convertIcon() {
    console.log('Converting zumi-z-logo.png to various formats...');

    // Create output directories if they don't exist
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    // Copy original to assets as icon.png
    await sharp(sourceIcon)
        .resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toFile(path.join(outputDir, 'icon.png'));
    console.log('✓ Created icon.png (256x256)');

    // Create ICO file for Windows (multiple sizes in one file)
    // ICO format needs specific sizes: 16, 32, 48, 256
    const icoSizes = [16, 32, 48, 256];
    const icoBuffers = [];

    for (const size of icoSizes) {
        const buffer = await sharp(sourceIcon)
            .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .png()
            .toBuffer();
        icoBuffers.push(buffer);
    }

    // For simplicity, we'll create a 256x256 PNG and rename it to .ico
    // (Windows will accept PNG format in .ico extension)
    await sharp(sourceIcon)
        .resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toFile(path.join(outputDir, 'icon.ico'));
    console.log('✓ Created icon.ico (256x256)');

    // Also create app-icon.ico in public/images
    await sharp(sourceIcon)
        .resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toFile(path.join(publicOutputDir, 'app-icon.ico'));
    console.log('✓ Created app-icon.ico (256x256)');

    console.log('Icon conversion complete!');
}

convertIcon().catch(console.error);
