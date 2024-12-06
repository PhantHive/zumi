import { app, BrowserWindow } from 'electron';
import path from 'path';
require('@electron/remote/main').initialize();
import { DiscordPresence } from './discordRPC';
import { ipcMain } from 'electron';

const discordRPC = new DiscordPresence();

ipcMain.on('update-presence', (_event, songData) => {
  discordRPC.updatePresence(songData);
});

ipcMain.on('clear-presence', () => {
  discordRPC.clearPresence();
});

function createWindow() {
  const isDev = process.env.NODE_ENV === 'development'; // Check environment

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false,
    transparent: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  require('@electron/remote/main').enable(win.webContents);

  if (isDev) {
    // Load Webpack Dev Server URL in development mode
    console.log("Development Mode: Loading from Webpack Dev Server...");
    win.loadURL('http://localhost:8080'); // Match Webpack Dev Server port
    win.webContents.openDevTools(); // Optional: Open DevTools for debugging
  } else {
    // Load production build in production mode
    console.log("Production Mode: Loading from dist/...");
    win.loadFile(path.join(__dirname, '../../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  console.log('Creating Electron window...');
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
