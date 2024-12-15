import React, { useState } from 'react';
import { ipcRenderer } from 'electron';
import { useAuth } from '../context/AuthContext';
import { FcGoogle } from 'react-icons/fc';
import '../styles/login.css';

const Login: React.FC = () => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { setIsAuthenticated } = useAuth();

    const handleSignIn = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await ipcRenderer.invoke('auth:sign-in');
            if (response.success) {
                setIsAuthenticated(true);
            } else {
                setError(response.error);
            }
        } catch (err) {
            console.error('Sign in error:', err);
            setError('An error occurred during sign-in.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-container">
            <h1>Sign In</h1>
            {error && <p className="error">{error}</p>}
            <button
                onClick={handleSignIn}
                disabled={loading}
                className="google-sign-in-button"
            >
                <FcGoogle className="google-icon" />
                {loading ? 'Signing in...' : 'Sign In with Google'}
            </button>
        </div>
    );
};

export default Login;
