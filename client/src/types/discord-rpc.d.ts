declare module 'discord-rpc' {
  export class Client {
    constructor(options: { transport: 'ipc' | 'websocket' });
    login(options: { clientId: string }): Promise<void>;
    setActivity(presence: {
      details?: string;
      state?: string;
      startTimestamp?: number;
      endTimestamp?: number;
      largeImageKey?: string;
      largeImageText?: string;
      smallImageKey?: string;
      smallImageText?: string;
      instance?: boolean;
    }): Promise<void>;
    clearActivity(): Promise<void>;
    destroy(): Promise<void>;
  }
}