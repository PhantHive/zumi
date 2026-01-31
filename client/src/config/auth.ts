import fs from 'fs';
import path from 'path';

const isDev = process.env.NODE_ENV === 'development';

let prodEnv = {
    GOOGLE_CLIENT_ID: '',
    GOOGLE_CLIENT_SECRET: '',
};
if (!isDev) {
    try {
        // In a packaged app, env.json should be in the resources folder
        const envPath = path.join(process.resourcesPath, 'env.json');
        console.log('Loading env from:', envPath);

        const envContent = fs.readFileSync(envPath, 'utf8');
        prodEnv = JSON.parse(envContent);
        console.log('Loaded env successfully');
    } catch (err) {
        console.error('Failed to load production environment:', err);
    }
}

console.log('Final auth config:', {
    clientId: isDev ? process.env.GOOGLE_CLIENT_ID : prodEnv.GOOGLE_CLIENT_ID,
    isDev,
    hasProdEnv: Object.keys(prodEnv).length > 0,
});

export const authConfig = {
    clientId: isDev ? process.env.GOOGLE_CLIENT_ID : prodEnv.GOOGLE_CLIENT_ID,
    clientSecret: isDev
        ? process.env.GOOGLE_CLIENT_SECRET
        : prodEnv.GOOGLE_CLIENT_SECRET,
    redirectUri: 'http://localhost:3000/oauth/callback',
    scopes: [
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
    ],
    access_type: 'offline',
    prompt: 'consent',
};