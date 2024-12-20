import DiscordRPC from 'discord-rpc';

import dotenv from 'dotenv';
dotenv.config();

console.log('DISCORD_ID:', process.env.DISCORD_ID);

export class DiscordPresence {
    private client: DiscordRPC.Client;
    private readonly GENRE_ASSETS = {
        rap: 'rap_logo',
        kpop: 'kpop_logo',
        default: 'app_logo',
    };

    constructor() {
        const clientId = process.env.DISCORD_ID; // Get this from Discord Developer Portal
        this.client = new DiscordRPC.Client({ transport: 'ipc' });

        if (!clientId) {
            console.error(
                'No Discord client ID found. Please set DISCORD_ID in .env file.',
            );
            return;
        }
        this.client.login({ clientId }).catch(console.error);
    }

    updatePresence(song: {
        title: string;
        artist: string;
        duration: number;
        startTime?: number;
        albumId?: string;
        thumbnailUrl?: string;
    }) {
        const now = Date.now();
        const largeImageKey =
            this.GENRE_ASSETS[song.albumId as keyof typeof this.GENRE_ASSETS] ||
            this.GENRE_ASSETS.default;

        this.client
            .setActivity({
                details: song.title,
                state: `by ${song.artist}`,
                startTimestamp: now,
                endTimestamp: now + song.duration * 1000,
                // from thumbnailUrl
                largeImageKey: largeImageKey,
                largeImageText: `Playing from ${song.albumId || 'Unknown'} playlist`,
                smallImageKey: 'zumi',
                smallImageText: '▶️ Now Playing',
                buttons: [
                    { label: 'My website', url: 'https://www.phanthive.com' },
                ],
            })
            .then((r) => console.log('Presence updated:', r))
            .catch(console.error);
    }

    clearPresence() {
        this.client.clearActivity();
    }
}
