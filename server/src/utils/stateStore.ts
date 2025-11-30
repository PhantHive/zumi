// In-memory store for OAuth state parameters
// In production, consider using Redis for scalability

interface StateData {
    value: string;
    expiresAt: number;
}

class StateStore {
    private store: Map<string, StateData> = new Map();

    set(key: string, value: string, ttlMinutes: number = 10): void {
        const expiresAt = Date.now() + ttlMinutes * 60 * 1000;
        this.store.set(key, { value, expiresAt });

        // Clean up expired entries periodically
        this.cleanup();
    }

    get(key: string): string | null {
        const data = this.store.get(key);

        if (!data) {
            return null;
        }

        // Check if expired
        if (Date.now() > data.expiresAt) {
            this.store.delete(key);
            return null;
        }

        return data.value;
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
