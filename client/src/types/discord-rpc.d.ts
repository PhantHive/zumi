declare module 'discord-rpc' {
    export class Client {
        constructor(options: { transport: 'ipc' | 'websocket' });
        login(options: { clientId: string }): Promise<void>;

        setActivity(presence: {
            smallImageKey: string;
            largeImageText: `Playing from ${string} playlist`;
            largeImageKey: string;
            details: string;
            state: `by ${string}`;
            endTimestamp: number;
            smallImageText: string;
            startTimestamp: number;
            buttons: { label: string; url: string }[];
        }): Promise<void>;
        clearActivity(): Promise<void>;
        destroy(): Promise<void>;
    }
}
