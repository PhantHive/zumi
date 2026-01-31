import dotenv from 'dotenv';
dotenv.config();

import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { DiscordPresence } from './discordRPC.js';
import { AuthHandler } from './auth.js';
import { fileURLToPath } from 'url';
import { ThumbnailToolbar } from './thumbnailToolbar.js';
import { promises as fs } from 'fs'

const discordRPC = new DiscordPresence();
const authHandler = new AuthHandler();


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function createWindow() {
    const isDev = process.env.NODE_ENV === 'development';
    console.log('Running in:', process.env.NODE_ENV, 'mode');
    console.log('Current __dirname:', __dirname);

    const win = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1200,
        minHeight: 850,
        frame: false,
        transparent: true,
        resizable: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webSecurity: false,
            devTools: true,
        },
        icon: path.join(__dirname, '../assets/icon.ico'),
    });

    win.on('close', () => {
        win.webContents.send('app-reset');
    });

    win.webContents.on(
        'did-fail-load',
        (event, errorCode, errorDescription) => {
            console.error('Failed to load:', errorCode, errorDescription);
        },
    );

    win.webContents.on('did-finish-load', () => {
        console.log('Finished loading');
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
            const fileExists = await fs
                .access(rendererPath)
                .then(() => true)
                .catch(() => false);

            if (fileExists) {
                console.log('File exists at path');
                await win.loadFile(rendererPath);
            } else {
                console.error('File does not exist at path:', rendererPath);
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

    const isDev = process.env.NODE_ENV === 'development';

    // REMOVED: Protocol handler registration that was interfering with Google OAuth
    // The zumi:// protocol handler was causing Google OAuth to try using
    // zumi://oauth/callback instead of http://localhost:3000/oauth/callback
    // This caused Error 400: invalid_request from Google
    //
    // If you need deep linking in the future, implement it AFTER OAuth is working
    // and ensure it doesn't interfere with the OAuth flow

    const win = BrowserWindow.getFocusedWindow();

    ipcMain.handle('window-is-maximized', () => {
        console.log('window-is-maximized handler registered');
        return win?.isMaximized();
    });

    // Register auth handlers
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

    // PIN handlers
    ipcMain.handle('pin:has-pin', async () => {
        console.log('pin:has-pin handler invoked');
        try {
            // Check if authHandler's store has a pinHash
            const store = authHandler.store;
            if (!store) {
                return { success: false, hasPinSet: false };
            }

            const pinHash = store.get('pinHash');
            return {
                success: true,
                hasPinSet: !!pinHash
            };
        } catch (error: unknown) {
            if (error instanceof Error) {
                console.error('Check PIN error:', error.message);
                return { success: false, error: error.message, hasPinSet: false };
            }
            return { success: false, error: 'Unknown error', hasPinSet: false };
        }
    });

    ipcMain.handle('pin:set', async (_event, pinHash: string) => {
        console.log('pin:set handler invoked');
        try {
            const store = authHandler.store;
            if (!store) {
                throw new Error('Store not initialized');
            }

            store.set('pinHash', pinHash);
            console.log('PIN hash set successfully');
            return { success: true };
        } catch (error: unknown) {
            if (error instanceof Error) {
                console.error('Set PIN error:', error.message);
                return { success: false, error: error.message };
            }
            return { success: false, error: 'Unknown error' };
        }
    });

    ipcMain.handle('pin:verify', async (_event, pinHash: string) => {
        console.log('pin:verify handler invoked');
        try {
            const store = authHandler.store;
            if (!store) {
                throw new Error('Store not initialized');
            }

            const storedHash = store.get('pinHash');
            if (!storedHash) {
                return {
                    success: true,
                    valid: false,
                    error: 'No PIN set'
                };
            }

            const isValid = storedHash === pinHash;
            console.log('PIN verification result:', isValid);
            return {
                success: true,
                valid: isValid
            };
        } catch (error: unknown) {
            if (error instanceof Error) {
                console.error('Verify PIN error:', error.message);
                return { success: false, error: error.message, valid: false };
            }
            return { success: false, error: 'Unknown error', valid: false };
        }
    });

    ipcMain.handle('pin:delete', async () => {
        console.log('pin:delete handler invoked');
        try {
            const store = authHandler.store;
            if (!store) {
                throw new Error('Store not initialized');
            }

            store.delete('pinHash');
            console.log('PIN hash deleted successfully');
            return { success: true };
        } catch (error: unknown) {
            if (error instanceof Error) {
                console.error('Delete PIN error:', error.message);
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

    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// REMOVED: Duplicate 'open-url' handler that was also interfering with OAuth
// This was a duplicate of the handler that was inside app.whenReady()
// and wasn't needed since we're using HTTP redirect, not custom protocol

export default app;