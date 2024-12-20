declare module 'electron-store' {
    type Schema = {
        tokens?: {
            access_token: string;
            refresh_token?: string;
            scope: string;
            token_type: string;
            expiry_date: number;
        };
    };

    class ElectronStore<T extends Schema = Schema> {
        constructor(options?: {
            name?: string;
            encryptionKey?: string;
            defaults?: Partial<T>;
            clearInvalidConfig?: boolean;
            cwd?: string;
        });
        get<K extends keyof T>(key: K): T[K];
        set<K extends keyof T>(key: K, value: T[K]): void;
        delete<K extends keyof T>(key: K): void;
        clear(): void;
    }

    export = ElectronStore;
}
