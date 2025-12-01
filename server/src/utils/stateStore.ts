// In-memory store for OAuth state parameters
// In production, consider using Redis for scalability

interface StateData {
    value: string;
    deepLinkBase: string;
    scheme?: string;
    expiresAt: number;
}

class StateStore {
    private store: Map<string, StateData> = new Map();

    set(
        key: string,
        value: string,
        ttlMinutes: number = 10,
        deepLinkBase: string = 'zumi://',
        scheme?: string,
    ): void {
        const expiresAt = Date.now() + ttlMinutes * 60 * 1000;
        this.store.set(key, { value, deepLinkBase, scheme, expiresAt });

        // Clean up expired entries periodically
        this.cleanup();
    }

    get(key: string): StateData | null {
        const data = this.store.get(key);

        if (!data) {
            return null;
        }

        // Check if expired
        if (Date.now() > data.expiresAt) {
            this.store.delete(key);
            return null;
        }

        return data;
    }

    delete(key: string): void {
        this.store.delete(key);
    }

    private cleanup(): void {
        const now = Date.now();
        for (const [key, data] of this.store.entries()) {
            if (now > data.expiresAt) {
                this.store.delete(key);
            }
        }
    }
}

export const stateStore = new StateStore();
