/**
 * Auth context — provides user state and login/logout actions app-wide.
 * Tokens held in memory via lib/api.ts (never persisted to localStorage).
 */
import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { login as apiLogin, setTokens, clearTokens, type UserInfo } from './api.js';

interface AuthState {
  user: UserInfo | null;
  isLoading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }){
  const [state, setState] = useState<AuthState>({ user: null, isLoading: false });

  const login = useCallback(async (email: string, password: string) => {
    setState((s) => ({ ...s, isLoading: true }));
    try {
      const data = await apiLogin(email, password);
      setTokens(data.accessToken, data.refreshToken);
      setState({ user: data.user, isLoading: false });
    } catch (err) {
      setState((s) => ({ ...s, isLoading: false }));
      throw err;
    }
  }, []);

  const logout = useCallback(() => {
    clearTokens();
    setState({ user: null, isLoading: false });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
