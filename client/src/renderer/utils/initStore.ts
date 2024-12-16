// utils/initStore.ts
type Listener = () => void;

class InitializationStore {
    private isInitialized: boolean = false;
    private listeners: Set<Listener> = new Set();

    getSnapshot() {
        return this.isInitialized;
    }

    subscribe(listener: Listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    initialize() {
        if (!this.isInitialized) {
            this.isInitialized = true;
            this.listeners.forEach((listener) => listener());
        }
    }

    reset() {
        this.isInitialized = false;
        this.listeners.forEach((listener) => listener());
    }
}

export const initStore = new InitializationStore();
