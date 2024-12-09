import dotenv from 'dotenv';
dotenv.config();

import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { DiscordPresence } from './discordRPC.js';
import { AuthHandler } from './auth.js';
import { fileURLToPath } from 'url';

const discordRPC = new DiscordPresence();
const authHandler = new AuthHandler();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createWindow() {
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
      contextIsolation: false
    }
  });

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
    win.loadURL('http://localhost:8080');
    win.webContents.openDevTools();
  } else {
    const rendererPath = path.join(__dirname, '../../renderer/index.html');
    console.log('Trying to load renderer from:', rendererPath);
    win.loadFile(rendererPath);
  }
}

app.whenReady().then(() => {
  console.log('App is ready');

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
    } catch (error: any) {
      console.error('Sign in error:', error.message);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('auth:get-user-info', async () => {
    console.log('auth:get-user-info handler invoked');
    try {
      const userInfo = await authHandler.getUserInfo();
      console.log('User info:', userInfo);
      return { success: true, data: userInfo };
    } catch (error: any) {
      console.error('Get user info error:', error.message);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('auth:sign-out', async () => {
    console.log('auth:sign-out handler invoked');
    try {
      await authHandler.signOut();
      return { success: true };
    } catch (error: any) {
      console.error('Sign out error:', error.message);
      return { success: false, error: error.message };
    }
  });

  createWindow();
});

app.on('window-all-closed', () => {
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