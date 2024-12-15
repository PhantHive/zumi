// client/src/renderer/index.tsx
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import Login from './components/Login';
import { AuthProvider, useAuth } from './context/AuthContext';
import './styles/global.css';
import Loading from './components/Loading';
import TitleBar from './components/TitleBar';

const Root: React.FC = () => {
    const { isAuthenticated } = useAuth();
    const [isLoading, setIsLoading] = useState(true);
    const [forceLoading, setForceLoading] = useState(true);

    useEffect(() => {
        const navigationType = (
            window.performance.getEntriesByType(
                'navigation',
            )[0] as PerformanceNavigationTiming
        ).type;
        if (navigationType === 'reload') {
            setIsLoading(false);
            setForceLoading(false);
        } else {
            setIsLoading(false);
            const timer = setTimeout(() => setForceLoading(false), 7000);
            return () => clearTimeout(timer);
        }
    }, []);

    return (
        <div>
            <TitleBar />
            {isLoading || forceLoading ? (
                <Loading />
            ) : isAuthenticated ? (
                <App />
            ) : (
                <Login />
            )}
        </div>
    );
};

const container = document.getElementById('root');
if (!container) {
    throw new Error('Root element not found');
}

const root = createRoot(container);
root.render(
    <React.StrictMode>
        <AuthProvider>
            <Root />
        </AuthProvider>
    </React.StrictMode>,
);
