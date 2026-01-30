import Loading from './components/Loading';
import PinLockScreen from './components/PinLock';

declare global {
    interface Window {
        __APP_INITIALIZED__?: boolean;
    }
}

import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import Login from './components/Login';
import { AuthProvider, useAuth } from './context/AuthContext';
import './styles/global.css';
import TitleBar from './components/TitleBar';
import { ipcRenderer } from 'electron';

const Root: React.FC = () => {
    const { isAuthenticated, isLoading: authLoading } = useAuth();
    const [isLoading, setIsLoading] = useState(true);
    const [hasPin, setHasPin] = useState(false);
    const [isUnlocked, setIsUnlocked] = useState(false);
    const [isPinLoading, setIsPinLoading] = useState(true);

    // Check if PIN is set
    useEffect(() => {
        let mainReady = false;
        const runCheck = async () => {
            try {
                // Wait for main-ready from the main process (timeout after 2s)
                mainReady = await new Promise<boolean>((resolve) => {
                    const timeout = setTimeout(() => resolve(false), 2000);
                    try {
                        ipcRenderer.once('main-ready', (_event, data) => {
                            clearTimeout(timeout);
                            // expose API port to apiClient fallback
                            if (data && data.apiPort) {
                                (window as any).__API_PORT__ = data.apiPort;
                            }
                            resolve(true);
                        });
                    } catch (err) {
                        clearTimeout(timeout);
                        resolve(false);
                    }
                });

                if (!mainReady) {
                    // proceed but be defensive (main didn't respond in time)
                    console.warn('main-ready not received within timeout');
                }

                // The IPC handler returns an object: { success: true, hasPinSet: boolean }
                const pinResp = await ipcRenderer.invoke('pin:has-pin');
                // Normalize to a boolean. Some older code expected a raw boolean; handle both.
                const pinSet = typeof pinResp === 'boolean' ? pinResp : !!pinResp?.hasPinSet;
                setHasPin(pinSet);
                setIsUnlocked(!pinSet); // Auto-unlock if no PIN
            } catch (error) {
                // Defensive: when running renderer in a browser (or before main registers handlers)
                const msg = error instanceof Error ? error.message : String(error);
                if (
                    msg.includes('No handler registered') ||
                    msg.includes('ipcRenderer is not defined') ||
                    msg.includes('not implemented') ||
                    msg.includes('invoke')
                ) {
                    // Previously we auto-unlocked here which allowed bypassing auth when running in a browser.
                    // For security, do NOT auto-unlock. Treat missing IPC as unauthenticated / locked.
                    console.warn('IPC not available; running without Electron. Keeping UI locked for safety.');
                    setHasPin(false);
                    setIsUnlocked(false);
                } else {
                    console.error('Error checking PIN:', error);
                    setIsUnlocked(false); // Default to locked on error
                }
            } finally {
                setIsPinLoading(false);
            }
        };

        runCheck();
    }, []);

    useEffect(() => {
        if (!authLoading && !isPinLoading) {
            const loadingTimeout = setTimeout(() => {
                setIsLoading(false);
            }, 2500);

            return () => clearTimeout(loadingTimeout);
        }
    }, [authLoading, isPinLoading]);

    const handleUnlock = () => {
        setIsUnlocked(true);
    };

    // Show loading while checking auth or PIN
    if (authLoading || isLoading || isPinLoading) {
        return (
            <div>
                <TitleBar />
                <Loading />
            </div>
        );
    }

    // Show PIN lock if authenticated, has PIN, and not unlocked
    if (isAuthenticated && hasPin && !isUnlocked) {
        return (
            <div>
                <TitleBar />
                <PinLockScreen onUnlock={handleUnlock} />
            </div>
        );
    }

    // Show login if not authenticated
    if (!isAuthenticated) {
        return (
            <div>
                <TitleBar />
                <Login />
            </div>
        );
    }

    // Show main app if authenticated and (no PIN or unlocked)
    return (
        <div>
            <TitleBar />
            <App />
        </div>
    );
};

const initializeApp = () => {
    const container = document.getElementById('root');

    if (!container) {
        throw new Error('Root element not found');
    }

    console.log('Initializing application');
    const root = createRoot(container);

    root.render(
        <AuthProvider>
            <Root />
        </AuthProvider>,
    );
};

if (!window.__APP_INITIALIZED__) {
    window.__APP_INITIALIZED__ = true;
    try {
        initializeApp();
    } catch (error) {
        console.error('Failed to initialize application:', error);
    }
}