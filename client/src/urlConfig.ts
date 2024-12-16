import fs from 'fs';
import path from 'path';

const isDev = process.env.NODE_ENV === 'development';

let prodEnv = {
    VPS_IP: '',
    API_PORT: '',
};

if (!isDev) {
    try {
        const envPath = path.join(process.resourcesPath, 'env.json');
        const envContent = fs.readFileSync(envPath, 'utf8');
        prodEnv = JSON.parse(envContent);
    } catch (err) {
        console.error('Failed to load production environment:', err);
    }
}

export const API_URL = isDev
    ? 'http://localhost:3000'
    : `http://${prodEnv.VPS_IP}:${prodEnv.API_PORT}`;

console.log('API URL configured as:', API_URL);
