import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import toIco from 'to-ico';

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

    // Create proper ICO file with multiple sizes
    const icoSizes = [16, 32, 48, 64, 128, 256];
    const pngBuffers = [];

    for (const size of icoSizes) {
        const buffer = await sharp(sourceIcon)
            .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .png()
            .toBuffer();
        pngBuffers.push(buffer);
    }

    // Create ICO file for assets
    const icoBuffer = await toIco(pngBuffers);
    fs.writeFileSync(path.join(outputDir, 'icon.ico'), icoBuffer);
    console.log('✓ Created icon.ico with multiple sizes');

    // Create ICO file for public/images (app-icon.ico)
    fs.writeFileSync(path.join(publicOutputDir, 'app-icon.ico'), icoBuffer);
    console.log('✓ Created app-icon.ico with multiple sizes');

    console.log('Icon conversion complete!');
}

convertIcon().catch(console.error);
