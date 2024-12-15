// client/src/renderer/index.tsx
import React, {useEffect, useState} from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import Login from './components/Login';
import { AuthProvider, useAuth } from './context/AuthContext';
import './styles/global.css';
import Loading from "./components/Loading";

const Root: React.FC = () => {
  console.log('Root component rendering');
  const { isAuthenticated } = useAuth();
   const [isLoading, setIsLoading] = useState(true);
   const [forceLoading, setForceLoading] = useState(true);

  console.log('Auth state:', isAuthenticated);

    useEffect(() => {
        const navigationType =
    (window.performance.getEntriesByType('navigation')
        [0] as PerformanceNavigationTiming).type;
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
      {(isLoading || forceLoading) ? <Loading /> : (isAuthenticated ? <App /> : <Login />)}
    </div>
  );
};

// Debug logs
console.log('Script starting');
const container = document.getElementById('root');
console.log('Container found:', container);

if (!container) {
  console.error('Root element not found!');
  throw new Error('Root element not found');
}

const root = createRoot(container);
console.log('Root created');

root.render(
  <React.StrictMode>
    <AuthProvider>
      <Root />
    </AuthProvider>
  </React.StrictMode>
);
console.log('Render called');