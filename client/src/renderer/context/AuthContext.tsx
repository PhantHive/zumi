import React, {
    createContext,
    useContext,
    useState,
    useEffect,
    useRef,
} from 'react';
import { ipcRenderer } from 'electron';
import { UserData } from '../../main/auth';

interface AuthContextType {
    isAuthenticated: boolean;
    setIsAuthenticated: (value: boolean) => void;
    userInfo: UserData | null;
    signOut: () => Promise<void>;
    isLoading: boolean;
}

interface AuthState {
    isAuthenticated: boolean;
    userInfo: UserData | null;
    isLoading: boolean;
}

const initialState: AuthState = {
    isAuthenticated: false,
    userInfo: null,
    isLoading: true,
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
    children,
}) => {
    const [authState, setAuthState] = useState<AuthState>(initialState);
    const initializeRef = useRef(false);
    const mountCountRef = useRef(0);

    useEffect(() => {
        mountCountRef.current += 1;
        const mountId = mountCountRef.current;
        console.log(`AuthProvider mount #${mountId}`);

        if (initializeRef.current) {
            console.log('Auth already initialized, skipping');
            return;
        }
        initializeRef.current = true;

        const initializeAuth = async () => {
            console.log('Starting auth initialization');

            try {
                const response = await ipcRenderer.invoke('auth:get-user-info');
                console.log('Auth check response received:', {
                    success: response.success,
                    hasData: !!response.data,
                });

                setAuthState({
                    isAuthenticated: response.success,
                    userInfo: response.data || null,
                    isLoading: false,
                });
            } catch (error) {
                console.error('Auth initialization failed:', error);
                setAuthState({
                    isAuthenticated: false,
                    userInfo: null,
                    isLoading: false,
                });
            }
        };

        initializeAuth();

        return () => {
            console.log(`AuthProvider cleanup #${mountId}`);
        };
    }, []);

    const setIsAuthenticated = (value: boolean) => {
        console.log('Setting authentication state:', value);
        setAuthState((prev) => ({
            ...prev,
            isAuthenticated: value,
        }));
    };

    const signOut = async () => {
        console.log('Signing out...');
        try {
            await ipcRenderer.invoke('auth:sign-out');
            setAuthState({
                isAuthenticated: false,
                userInfo: null,
                isLoading: false,
            });
            console.log('Sign out successful');
        } catch (error) {
            console.error('Sign out failed:', error);
            throw error;
        }
    };

    const value = {
        isAuthenticated: authState.isAuthenticated,
        setIsAuthenticated,
        userInfo: authState.userInfo,
        signOut,
        isLoading: authState.isLoading,
    };

    console.log('AuthProvider render:', {
        mountCount: mountCountRef.current,
        isInitialized: initializeRef.current,
        ...authState,
    });

    return (
        <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
