import { app, BrowserWindow, session } from 'electron';
import { OAuth2Client } from 'google-auth-library';
import { authConfig } from '../config/auth.js';
import Store from 'electron-store';
import { API_URL } from '../urlConfig.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface AuthTokens {
    access_token: string;
    refresh_token?: string;
    scope: string;
    token_type: string;
    expiry_date: number;
}

export interface UserData {
    id: string;
    email: string;
    name: string;
    picture?: string;
}

interface StoreSchema {
    tokens: AuthTokens;
    serverToken: string;
    user: UserData;
    test: string;
    pinHash?: string;
}

let prodEnv = {
    GOOGLE_CLIENT_ID: '',
    GOOGLE_CLIENT_SECRET: '',
    STORE_ENCRYPTION_KEY: '',
    JWT_SECRET: '',
};

const isDev = process.env.NODE_ENV === 'development';

export class AuthHandler {
    private oAuth2Client: OAuth2Client;
    private authWindow: BrowserWindow | null = null;
    private callbackPromise: {
        resolve: (value: string) => void;
        reject: (reason?: unknown) => void;
    } | null = null;
    public store: Store<StoreSchema> | undefined;

    constructor() {
        this.logToFile('Initializing AuthHandler...');
        this.logToFile(`Environment: ${isDev ? 'development' : 'production'}`);

        if (!isDev) {
            try {
                const envPath = path.join(process.resourcesPath, 'env.json');
                this.logToFile(`Loading env from: ${envPath}`);
                const envContent = fs.readFileSync(envPath, 'utf8');
                prodEnv = JSON.parse(envContent);
                this.logToFile('Env loaded successfully');
            } catch (err) {
                this.logToFile(`Failed to load production environment: ${err}`);
            }
        }

        const encryptionKey = isDev
            ? process.env.STORE_ENCRYPTION_KEY
            : prodEnv.STORE_ENCRYPTION_KEY;
        this.logToFile(`Store encryption key exists: ${!!encryptionKey}`);

        // Try different store configurations
        try {
            this.store = new Store<StoreSchema>({
                name: 'auth',
                encryptionKey,
                clearInvalidConfig: true,
            });

            // Test store
            this.store.set('test', 'test-value');
            const testValue = this.store.get('test');
            this.logToFile(`Store test result: ${testValue === 'test-value'}`);
            this.store.delete('test');
        } catch (err) {
            this.logToFile(`Store initialization failed: ${err}`);
        }

        this.oAuth2Client = new OAuth2Client({
            clientId: authConfig.clientId,
            clientSecret: authConfig.clientSecret,
            redirectUri: authConfig.redirectUri,
        });

        // Initialize store and restore previous session if exists
        this.initializeStore().then(
            () => console.log('Store initialized successfully'),
            (error) => console.error('Store initialization failed:', error),
        );
    }

    private logToFile(message: string) {
        const logPath = isDev
            ? path.join(__dirname, 'auth.log')
            : path.join(app.getPath('userData'), 'auth.log');
        fs.appendFileSync(logPath, `${new Date().toISOString()}: ${message}\n`);
    }

    private async refreshToken() {
        try {
            const { credentials } =
                await this.oAuth2Client.refreshAccessToken();
            if (!credentials.access_token) {
                throw new Error('No access token in refreshed credentials');
            }

            const validCredentials: AuthTokens = {
                access_token: credentials.access_token,
                refresh_token: credentials.refresh_token ?? undefined,
                scope: credentials.scope ?? '',
                token_type: credentials.token_type ?? 'Bearer',
                expiry_date: credentials.expiry_date ?? Date.now() + 3600000,
            };

            this.store?.set('tokens', validCredentials);
            this.oAuth2Client.setCredentials(validCredentials);
        } catch (error) {
            this.store?.delete('tokens');
            throw error;
        }
    }

    private async initializeStore() {
        this.logToFile('=== Initializing Store ===');
        const storedTokens = this.store?.get('tokens') as
            | AuthTokens
            | undefined;
        if (storedTokens?.access_token) {
            if (
                storedTokens.expiry_date &&
                Date.now() > storedTokens.expiry_date
            ) {
                await this.refreshToken();
            }
            this.oAuth2Client.setCredentials(storedTokens);
        }

        this.logToFile(`Stored tokens: ${JSON.stringify(storedTokens)}`);
    }

    handleCallback(url: string): void {
        try {
            const urlObj = new URL(url);
            const code = urlObj.searchParams.get('code');
            if (code && this.callbackPromise) {
                this.callbackPromise.resolve(code);
            }
        } catch (err) {
            if (this.callbackPromise) {
                this.callbackPromise.reject(err);
            }
        }
    }

    async getUserInfo() {
        console.log('Getting user info');

        // Check if we have stored tokens
        const storedTokens = this.store?.get('tokens') as
            | AuthTokens
            | undefined;

        // write to log file
        this.logToFile('=== Getting User Info ===');
        this.logToFile('Getting user info');
        this.logToFile(`Stored tokens: ${!!storedTokens?.access_token}`);

        if (storedTokens?.access_token) {
            this.oAuth2Client.setCredentials(storedTokens);

            this.logToFile('Stored tokens exist');
            this.logToFile(`Access token: ${storedTokens.access_token}`);
            // Validate with server if we don't have a server token
            if (!this.getServerToken()) {
                // Let validation errors bubble up so callers (and ipc handlers) can detect failed server validation
                await this.validateWithServer(storedTokens.access_token);
            }
        }

        if (!this.oAuth2Client.credentials?.access_token) {
            throw new Error('Not authenticated');
        }

        try {
            const response = await fetch(
                'https://www.googleapis.com/oauth2/v2/userinfo',
                {
                    headers: {
                        Authorization: `Bearer ${this.oAuth2Client.credentials.access_token}`,
                        Accept: 'application/json',
                    },
                },
            );

            console.log('Response status:', response.status);
            const text = await response.text();
            console.log('Response body:', text);

            if (!response.ok) throw new Error(text);
            return JSON.parse(text);
        } catch (error) {
            console.error('Fetch error:', error);
            throw error;
        }
    }

    public async validateWithServer(accessToken: string) {
        try {
            this.logToFile('=== Server Validation Start ===');
            this.logToFile(`API URL: ${API_URL}`);
            this.logToFile(`Google access token exists: ${!!accessToken}`);

            const response = await fetch(`${API_URL}/api/auth/google`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify({
                    googleToken: accessToken,
                }),
            });

            this.logToFile(`Response status: ${response.status}`);
            const rawText = await response.text();
            this.logToFile(`Server response: ${rawText}`);

            const data = JSON.parse(rawText);
            this.logToFile(`Has token in response: ${!!data.token}`);

            if (data.token) {
                try {
                    const tokenParts = data.token.split('.');
                    this.logToFile(`Received JWT parts: ${tokenParts.length}`);
                    this.store?.set('serverToken', data.token);
                    const verifyToken = this.store?.get('serverToken');
                    this.logToFile(
                        `Token stored and verified: ${!!verifyToken}`,
                    );
                } catch (err) {
                    this.logToFile(`Failed to store token: ${err}`);
                }
            }

            return data;
        } catch (error) {
            this.logToFile(`Server validation error: ${error}`);
            throw error;
        }
    }

    public async getStoredTokens(): Promise<AuthTokens | undefined> {
        console.log('=== Getting Stored Tokens ===');
        this.logToFile('Getting stored tokens');
        const storedTokens = this.store?.get('tokens') as
            | AuthTokens
            | undefined;

        if (storedTokens?.access_token) {
            console.log('Stored tokens exist');
            this.logToFile('Stored tokens exist');
            return storedTokens;
        }
    }

    getServerToken(): string | null {
        console.log('=== Getting Server Token ===');
        try {
            const token = this.store?.get('serverToken') as string | null;
            if (token) {
                const parts = token.split('.');
                console.log('Retrieved token structure:', {
                    parts: parts.length,
                    hasHeader: !!parts[0],
                    hasPayload: !!parts[1],
                    hasSignature: !!parts[2],
                });
            }
            return token;
        } catch (err) {
            console.error('Error getting server token:', err);
            return null;
        }
    }

    // Clear stored server token and user information
    clearServerToken(): void {
        try {
            this.store?.delete('serverToken');
            this.store?.delete('user');
            console.log('Cleared stored server token and user data');
        } catch (err) {
            console.error('Failed to clear server token:', err);
        }
    }

    async signIn(): Promise<void> {
        // Check if we have stored tokens
        const storedTokens = await this.getStoredTokens();
        if (storedTokens?.access_token) {
            this.oAuth2Client.setCredentials(storedTokens);

            // Validate with server if we don't have a server token
            if (!this.getServerToken()) {
                try {
                    const serverAuth = await this.validateWithServer(
                        storedTokens.access_token,
                    );
                    this.store?.set('serverToken', serverAuth.token);
                    this.store?.set('user', serverAuth.user);
                    console.log('Already authenticated with server');
                    return;
                } catch (error) {
                    console.error('Failed to validate with server:', error);
                }
            } else {
                console.log('Already authenticated');
                return;
            }
        }

        // Proceed with OAuth flow if no valid stored tokens
        try {
            const authUrl = this.oAuth2Client.generateAuthUrl({
                access_type: 'offline',
                scope: authConfig.scopes,
                prompt: 'consent',
            });

            this.authWindow = new BrowserWindow({
                width: 800,
                height: 600,
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                },
            });

            await this.authWindow.loadURL(authUrl);

            const code = await new Promise<string>((resolve, reject) => {
                this.callbackPromise = { resolve, reject };

                if (this.authWindow) {
                    this.authWindow.webContents.session.webRequest.onBeforeRequest(
                        { urls: ['http://localhost:3000/oauth/callback*'] },
                        async ({ url }) => {
                            this.handleCallback(url);
                        },
                    );

                    this.authWindow.on('closed', () => {
                        this.authWindow = null;
                        if (this.callbackPromise) {
                            this.callbackPromise.reject(
                                new Error('Window was closed'),
                            );
                        }
                    });
                }
            });

            const { tokens } = await this.oAuth2Client.getToken(code);
            if (!tokens.access_token) {
                throw new Error('No access token received');
            }

            const validTokens: AuthTokens = {
                access_token: tokens.access_token,
                refresh_token: tokens.refresh_token ?? undefined,
                scope: tokens.scope ?? '',
                token_type: tokens.token_type ?? 'Bearer',
                expiry_date: tokens.expiry_date ?? Date.now() + 3600000,
            };

            this.oAuth2Client.setCredentials(validTokens);
            this.store?.set('tokens', validTokens);

            // After Google OAuth success, validate with our server
            const serverAuth = await this.validateWithServer(
                validTokens.access_token,
            );

            // Store the server JWT token
            this.store?.set('serverToken', serverAuth.token);
            this.store?.set('user', serverAuth.user);

            if (this.authWindow && !this.authWindow.isDestroyed()) {
                this.authWindow.close();
            }
        } catch (error) {
            console.error('Sign in error:', error);
            throw error instanceof Error ? error : new Error('Sign in failed');
        }
    }

    // Update signOut to also clear server tokens
    async signOut(): Promise<void> {
        try {
            this.store?.delete('tokens');
            this.store?.delete('serverToken'); // Clear server JWT
            this.store?.delete('user'); // Clear user data
            await this.oAuth2Client.revokeCredentials();
            await session.defaultSession.clearStorageData();
        } catch (error) {
            throw error instanceof Error ? error : new Error('Sign out failed');
        }
    }
}