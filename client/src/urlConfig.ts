import fs from 'fs';
import path from 'path';

const isDev = process.env.NODE_ENV === 'development';

// Allow overriding host/port in dev via environment variables (useful when server runs on a random port)
const DEV_API_HOST = process.env.API_HOST || process.env.VITE_API_HOST || 'localhost';
// Important: avoid using generic `process.env.PORT` which tools like webpack-dev-server may set (often 3000)
// and unintentionally override the API port you explicitly provide (API_PORT). Prefer explicit API_PORT/VITE_API_PORT.
const DEV_API_PORT = process.env.API_PORT || process.env.VITE_API_PORT || '31856';

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
    ? `http://${DEV_API_HOST}:${DEV_API_PORT}`
    : `http://${prodEnv.VPS_IP}:${prodEnv.API_PORT}`;

// Helpful debug output in dev to show what env vars were seen when this module executed
if (isDev) {
    try {
        console.log('API URL configured as:', API_URL);
        console.log('DEV env snapshot:', {
            API_PORT: process.env.API_PORT,
            VITE_API_PORT: process.env.VITE_API_PORT,
            PORT: process.env.PORT,
            API_HOST: process.env.API_HOST,
        });
    } catch (e) {
        // ignore logging errors
    }
}
