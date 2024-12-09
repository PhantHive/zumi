// client/src/renderer/context/AuthContext.tsx
import React, { createContext, useContext, useState, useEffect } from 'react';
import { ipcRenderer } from 'electron';

interface AuthContextType {
  isAuthenticated: boolean;
  setIsAuthenticated: (value: boolean) => void;
  userInfo: any | null;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userInfo, setUserInfo] = useState<any | null>(null);

  useEffect(() => {
    // Check auth status when component mounts
    checkStoredAuthStatus();
  }, []);

  const checkStoredAuthStatus = async () => {
  try {
    // Use existing getUserInfo since it already handles token validation
    const response = await ipcRenderer.invoke('auth:get-user-info');
    if (response.success) {
      setIsAuthenticated(true);
      setUserInfo(response.data);
    }
  } catch (error) {
    console.error('Auth check failed:', error);
  }
};


  const signOut = async () => {
    try {
      await ipcRenderer.invoke('auth:sign-out');
      setIsAuthenticated(false);
      setUserInfo(null);
    } catch (error) {
      console.error('Sign out failed:', error);
    }
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, setIsAuthenticated, userInfo, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};