import fs from 'fs';
import path from 'path';

const isDev = process.env.NODE_ENV === 'development';

// Check if we're in the main process or renderer process
const isMainProcess = process.type === 'browser';

let prodEnv = {
    VPS_IP: '',
    API_PORT: '',
};

if (!isDev && isMainProcess) {
    try {
        const envPath = path.join(process.resourcesPath, 'env.json');
        const envContent = fs.readFileSync(envPath, 'utf8');
        prodEnv = JSON.parse(envContent);
    } catch (err) {
        console.error('Failed to load production environment:', err);
    }
}

// SIMPLE SOLUTION: Just hardcode the dev port for renderer, use env for main
const DEV_API_PORT = '31856'; // Your development API port

let apiPort: string;

if (isDev) {
    if (isMainProcess) {
        // Main process: use environment variable
        apiPort = process.env.API_PORT || DEV_API_PORT;
    } else {
        // Renderer process: use hardcoded dev port
        // This is safe because dev port rarely changes
        apiPort = DEV_API_PORT;
    }
} else {
    // Production: use env.json config
    apiPort = prodEnv.API_PORT || '31856';
}

// Build the API URL
export const API_URL = isDev
    ? `http://localhost:${apiPort}`
    : `http://${prodEnv.VPS_IP}:${prodEnv.API_PORT}`;

console.log('API URL configured as:', API_URL);
console.log('Environment:', isDev ? 'development' : 'production');
console.log('Process type:', isMainProcess ? 'main' : 'renderer');
console.log('API_PORT:', apiPort);