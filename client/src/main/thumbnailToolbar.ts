import { BrowserWindow, nativeImage, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class ThumbnailToolbar {
    private mainWindow: BrowserWindow;
    private isPlaying: boolean = false;
    private icons: {
        previous: Electron.NativeImage;
        play: Electron.NativeImage;
        pause: Electron.NativeImage;
        next: Electron.NativeImage;
        zumi: Electron.NativeImage;
    };

    private setupThumbnailClip(): void {
        this.mainWindow.setThumbnailClip({
            x: 0,
            y: this.mainWindow.getBounds().height - 150,
            width: this.mainWindow.getBounds().width,
            height: 150,
        });
    }

    private setupEventListeners(): void {
        ipcMain.on('thumbnail-update-state', (_event, playing: boolean) => {
            this.isPlaying = playing;
            this.updateThumbarButtons();
        });

        ipcMain.on(
            'update-thumbnail-info',
            (_event, songInfo: { title: string; artist: string }) => {
                this.mainWindow.setThumbnailToolTip(
                    `${songInfo.title}\n${songInfo.artist}\nZumi Music Player`,
                );
            },
        );
    }

    constructor(mainWindow: BrowserWindow) {
        this.mainWindow = mainWindow;

        this.icons = {
            previous: this.createIcon('prev.png'),
            play: this.createIcon('play.png'),
            pause: this.createIcon('pause.png'),
            next: this.createIcon('next.png'),
            zumi: this.createIcon('zumi.png'),
        };

        this.setupEventListeners();
        this.setupThumbnailClip(); // Add this
        this.updateThumbarButtons();
    }

    private createIcon(filename: string): Electron.NativeImage {
        return nativeImage
            .createFromPath(
                path.join(__dirname, '../assets/thumbbar', filename),
            )
            .resize({ width: 16, height: 16 });
    }

    private updateThumbarButtons(): void {
        this.mainWindow.setThumbarButtons([
            {
                tooltip: 'Previous Song',
                icon: this.icons.previous,
                click: () => {
                    this.mainWindow.webContents.send('thumbnail-previous');
                },
            },
            {
                tooltip: this.isPlaying ? 'Pause' : 'Play',
                icon: this.isPlaying ? this.icons.pause : this.icons.play,
                click: () => {
                    this.mainWindow.webContents.send('thumbnail-playpause');
                },
            },
            {
                tooltip: 'Next Song',
                icon: this.icons.next,
                click: () => {
                    this.mainWindow.webContents.send('thumbnail-next');
                },
            },
            {
                tooltip: 'Let Zumi-chan choose a song!',
                icon: this.icons.zumi,
                click: () => {
                    this.mainWindow.webContents.send('thumbnail-random');
                },
            },
        ]);
    }
}
