import { ipcMain } from 'electron';
import ElectronStore from 'electron-store';

// Import the auth store schema
interface AuthTokens {
    access_token: string;
    refresh_token?: string;
    scope: string;
    token_type: string;
    expiry_date: number;
}

interface UserData {
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

// Use the same store configuration as auth
const isDev = process.env.NODE_ENV === 'development';
const encryptionKey = isDev
    ? process.env.STORE_ENCRYPTION_KEY
    : process.env.STORE_ENCRYPTION_KEY; // You might load this from env.json in production

const pinStore: ElectronStore<StoreSchema> = new ElectronStore<StoreSchema>({
    name: 'auth',  // Same store as auth
    encryptionKey,
    clearInvalidConfig: true,
});

export function setupPinHandlers() {
    // Check if PIN is set
    ipcMain.handle('pin:has-pin', () => {
        try {
            const pinHash = pinStore.get('pinHash');
            return !!pinHash && pinHash.length > 0;
        } catch (error) {
            console.error('Error checking PIN:', error);
            return false;
        }
    });

    // Set PIN
    ipcMain.handle('pin:set', async (_event, pinHash: string) => {
        try {
            if (!pinHash || typeof pinHash !== 'string') {
                return { success: false, error: 'Invalid PIN hash' };
            }
            pinStore.set('pinHash', pinHash);
            return { success: true };
        } catch (error) {
            console.error('Failed to set PIN:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to set PIN'
            };
        }
    });

    // Verify PIN
    ipcMain.handle('pin:verify', async (_event, pinHash: string) => {
        try {
            if (!pinHash || typeof pinHash !== 'string') {
                return { valid: false, error: 'Invalid PIN hash' };
            }

            const storedHash = pinStore.get('pinHash');

            if (!storedHash || storedHash.length === 0) {
                return { valid: false, error: 'No PIN set' };
            }

            return { valid: pinHash === storedHash };
        } catch (error) {
            console.error('Failed to verify PIN:', error);
            return {
                valid: false,
                error: error instanceof Error ? error.message : 'Failed to verify PIN'
            };
        }
    });

    // Delete PIN
    ipcMain.handle('pin:delete', async () => {
        try {
            pinStore.delete('pinHash');
            return { success: true };
        } catch (error) {
            console.error('Failed to delete PIN:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to delete PIN'
            };
        }
    });

    console.log('✅ PIN handlers initialized');
}