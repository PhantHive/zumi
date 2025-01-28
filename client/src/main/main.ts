import dotenv from 'dotenv';
dotenv.config();

import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { DiscordPresence } from './discordRPC.js';
import { AuthHandler } from './auth.js';
import { fileURLToPath } from 'url';
import { ThumbnailToolbar } from './thumbnailToolbar.js';
import { promises as fs } from 'fs';

const discordRPC = new DiscordPresence();
const authHandler = new AuthHandler();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function createWindow() {
    const isDev = process.env.NODE_ENV === 'development';
    console.log('Running in:', process.env.NODE_ENV, 'mode');
    console.log('Current __dirname:', __dirname);

    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        frame: false,
        transparent: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webSecurity: false,
            devTools: true,
        },
        icon: path.join(__dirname, '../assets/icon.png'),
    });

    win.on('close', () => {
        win.webContents.send('app-reset');
    });

    // Add these event listeners
    win.webContents.on(
        'did-fail-load',
        (event, errorCode, errorDescription) => {
            console.error('Failed to load:', errorCode, errorDescription);
        },
    );

    win.webContents.on('did-finish-load', () => {
        console.log('Finished loading');
        // Open DevTools in production to debug
        win.webContents.openDevTools();
    });

    win.setThumbnailToolTip('Zumi Chan');
    new ThumbnailToolbar(win);

    // Window control handlers
    ipcMain.on('window-minimize', () => win.minimize());
    ipcMain.on('window-maximize', () => {
        if (win.isMaximized()) {
            win.unmaximize();
        } else {
            win.maximize();
        }
    });
    ipcMain.on('window-close', () => win.close());

    // Discord RPC handlers
    ipcMain.on('update-presence', (_event, songData) => {
        discordRPC.updatePresence(songData);
    });
    ipcMain.on('clear-presence', () => {
        discordRPC.clearPresence();
    });

    if (isDev) {
        win.loadURL('http://localhost:31275');
        win.webContents.openDevTools();
    } else {
        const rendererPath = path.resolve(
            __dirname,
            '../../renderer/index.html',
        );
        console.log('Current directory:', process.cwd());
        console.log('__dirname:', __dirname);
        console.log('Attempting to load renderer from:', rendererPath);

        try {
            // Check if file exists using async/await
            const fileExists = await fs
                .access(rendererPath)
                .then(() => true)
                .catch(() => false);

            if (fileExists) {
                console.log('File exists at path');
                await win.loadFile(rendererPath);
            } else {
                console.error('File does not exist at path:', rendererPath);
                // Try listing contents of renderer directory
                const rendererDir = path.resolve(__dirname, '../../renderer');
                try {
                    const files = await fs.readdir(rendererDir);
                    console.log('Contents of renderer directory:', files);
                } catch (err) {
                    console.error('Renderer directory not found', err);
                }
            }
        } catch (err) {
            console.error('Error checking file:', err);
        }
    }
}

app.whenReady().then(async () => {
    console.log('App is ready');

    try {
        const storedTokens = await authHandler.getStoredTokens();
        console.log('Stored tokens:', storedTokens);
        if (storedTokens?.access_token) {
            console.log('Found stored credentials, validating with server...');
            await authHandler.validateWithServer(storedTokens.access_token);
        }
    } catch (error) {
        console.error('Error validating stored credentials:', error);
    }
    // session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    //     callback({
    //         responseHeaders: {
    //             ...details.responseHeaders,
    //             'Content-Security-Policy': [
    //                 "default-src 'self';" +
    //                 "script-src 'self' 'unsafe-inline';" +
    //                 "style-src 'self' 'unsafe-inline';" +
    //                 `connect-src 'self' ${API_URL};` +
    //                 // Update img-src to include your server URL
    //                 `img-src 'self' data: blob: ${API_URL};` +
    //                 "font-src 'self';" +
    //                 "object-src 'none';" +
    //                 "media-src 'self' blob:;" +
    //                 "frame-src 'none'",
    //             ],
    //         },
    //     });
    // });

    const isDev = process.env.NODE_ENV === 'development';

    // Only set up protocol client in production
    if (!isDev) {
        if (process.defaultApp) {
            if (process.argv.length >= 2) {
                app.setAsDefaultProtocolClient('zumi', process.execPath, [
                    process.argv[1],
                ]);
            }
        } else {
            app.setAsDefaultProtocolClient('zumi');
        }
    }

    // Handle callback in production
    app.on('open-url', (event, url) => {
        event.preventDefault();
        if (!isDev) {
            authHandler.handleCallback(url);
        }
    });

    const win = BrowserWindow.getFocusedWindow();

    // Register ipcMain.handle calls here
    ipcMain.handle('window-is-maximized', () => {
        console.log('window-is-maximized handler registered');
        return win?.isMaximized();
    });

    // Register auth handlers as soon as possible
    ipcMain.handle('auth:sign-in', async () => {
        console.log('auth:sign-in handler invoked');
        try {
            await authHandler.signIn();
            console.log('Sign in successful');
            return { success: true };
        } catch (error: unknown) {
            if (error instanceof Error) {
                console.error('Sign in error:', error.message);
                return { success: false, error: error.message };
            }
            return { success: false, error: 'Unknown error' };
        }
    });

    ipcMain.handle('auth:get-user-info', async () => {
        console.log('auth:get-user-info handler invoked');
        try {
            const userInfo = await authHandler.getUserInfo();
            const serverToken = authHandler.getServerToken();
            console.log('Server token exists:', !!serverToken);

            return {
                success: true,
                data: userInfo,
                token: serverToken, // Include server token
            };
        } catch (error: unknown) {
            if (error instanceof Error) {
                console.error('Get user info error:', error.message);
                return { success: false, error: error.message };
            }
            return { success: false, error: 'Unknown error' };
        }
    });

    ipcMain.handle('auth:sign-out', async () => {
        console.log('auth:sign-out handler invoked');
        try {
            await authHandler.signOut();
            return { success: true };
        } catch (error: unknown) {
            if (error instanceof Error) {
                console.error('Sign out error:', error.message);
                return { success: false, error: error.message };
            }
            return { success: false, error: 'Unknown error' };
        }
    });

    createWindow();
});

app.on('window-all-closed', () => {
    BrowserWindow.getAllWindows().forEach((window) => {
        window.webContents.send('app-reset');
    });

    // Your existing code
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// For macOS: re-create window when dock icon is clicked
app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// Handle auth callback URLs
app.on('open-url', (event, url) => {
    event.preventDefault();
    authHandler.handleCallback(url);
});
