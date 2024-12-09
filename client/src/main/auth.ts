import { BrowserWindow, session } from 'electron';
import { OAuth2Client, Credentials as GoogleCredentials } from 'google-auth-library';
import { authConfig } from "../config/auth.js";
import Store from 'electron-store';

interface AuthTokens {
  access_token: string;
  refresh_token?: string;
  scope: string;
  token_type: string;
  expiry_date: number;
}

export class AuthHandler {
  private oAuth2Client: OAuth2Client;
  private authWindow: BrowserWindow | null = null;
  private callbackPromise: {
    resolve: (value: string) => void;
    reject: (reason?: any) => void;
  } | null = null;
  private store: Store;

  constructor() {
    this.oAuth2Client = new OAuth2Client({
      clientId: authConfig.clientId,
      clientSecret: authConfig.clientSecret,
      redirectUri: authConfig.redirectUri,
    });
    this.store = new Store({
      name: 'auth',
      encryptionKey: process.env.STORE_ENCRYPTION_KEY,
    });

     this.initializeStore().then(
        () => console.log('Store initialized'),
        (error) => console.error('Store initialization error:', error
     ));
  }

  private async refreshToken(tokens: AuthTokens) {
    try {
      const { credentials } = await this.oAuth2Client.refreshAccessToken();
      if (!credentials.access_token) {
        throw new Error('No access token in refreshed credentials');
      }

      const validCredentials: AuthTokens = {
        access_token: credentials.access_token,
        refresh_token: credentials.refresh_token ?? undefined,
        scope: credentials.scope ?? '',
        token_type: credentials.token_type ?? 'Bearer',
        expiry_date: credentials.expiry_date ?? Date.now() + 3600000
      };

      this.store.set('tokens', validCredentials);
      this.oAuth2Client.setCredentials(validCredentials);
    } catch (error) {
      this.store.delete('tokens');
      throw error;
    }
  }

  private async initializeStore() {
    const storedTokens = this.store.get('tokens') as AuthTokens | undefined;
    if (storedTokens?.access_token) {
      if (storedTokens.expiry_date && Date.now() > storedTokens.expiry_date) {
        await this.refreshToken(storedTokens);
      }
      this.oAuth2Client.setCredentials(storedTokens);
    }
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

  async signIn(): Promise<void> {
    if (this.oAuth2Client.credentials?.access_token) {
      console.log('Already authenticated');
      return;
    }

    try {
      const authUrl = this.oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: authConfig.scopes,
        prompt: 'consent'
      });

      this.authWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true
        }
      });

      await this.authWindow.loadURL(authUrl);

      const code = await new Promise<string>((resolve, reject) => {
        this.callbackPromise = { resolve, reject };

        if (this.authWindow) {
          this.authWindow.webContents.session.webRequest.onBeforeRequest(
            { urls: ['http://localhost:3000/oauth/callback*'] },
            async ({ url }) => {
              this.handleCallback(url);
            }
          );

          this.authWindow.on('closed', () => {
            this.authWindow = null;
            if (this.callbackPromise) {
              this.callbackPromise.reject(new Error('Window was closed'));
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
        expiry_date: tokens.expiry_date ?? Date.now() + 3600000
      };

      this.oAuth2Client.setCredentials(validTokens);
      this.store.set('tokens', validTokens);

      if (this.authWindow && !this.authWindow.isDestroyed()) {
        this.authWindow.close();
      }
    } catch (error) {
      console.error('Sign in error:', error);
      throw error instanceof Error ? error : new Error('Sign in failed');
    }
  }

  async getUserInfo() {
 console.dir("Stored tokens:", this.store.get('tokens'));
 console.dir("OAuth credentials:", this.oAuth2Client.credentials);

 if (!this.oAuth2Client.credentials?.access_token) {
   throw new Error('Not authenticated');
 }

 try {
   const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
     headers: {
       'Authorization': `Bearer ${this.oAuth2Client.credentials.access_token}`,
       'Accept': 'application/json'
     }
   });

   console.log("Response status:", response.status);
   const text = await response.text();
   console.log("Response body:", text);

   if (!response.ok) throw new Error(text);
   return JSON.parse(text);
 } catch (error) {
   console.error("Fetch error:", error);
   throw error;
 }
}

  async signOut(): Promise<void> {
    try {
      this.store.delete('tokens');
      await this.oAuth2Client.revokeCredentials();
      await session.defaultSession.clearStorageData();
    } catch (error) {
      throw error instanceof Error ? error : new Error('Sign out failed');
    }
  }
}