// client/src/renderer/index.tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import Login from './components/Login';
import { AuthProvider, useAuth } from './context/AuthContext';
import './styles/global.css';

const Root: React.FC = () => {
  console.log('Root component rendering');
  const { isAuthenticated } = useAuth();
  console.log('Auth state:', isAuthenticated);

  return (
    <div>
      {isAuthenticated ? <App /> : <Login />}
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