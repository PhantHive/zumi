import Loading from './components/Loading';

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

const Root: React.FC = () => {
    const { isAuthenticated, isLoading: authLoading } = useAuth();
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!authLoading) {
            // Ensure the loading screen is shown for at least 2 seconds
            const loadingTimeout = setTimeout(() => {
                setIsLoading(false);
            }, 2500);

            return () => clearTimeout(loadingTimeout);
        }
    }, [authLoading]);

    if (authLoading || isLoading) {
        return (
            <div>
                <TitleBar />
                <Loading />
            </div>
        );
    }

    if (isAuthenticated) {
        return (
            <div>
                <TitleBar />
                <App />
            </div>
        );
    }

    return (
        <div>
            <TitleBar />
            <Login />
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
