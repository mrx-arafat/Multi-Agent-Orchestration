/**
 * Auth context — provides user state and login/logout actions app-wide.
 * On mount, tries to restore session from localStorage-persisted tokens.
 */
import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import {
  login as apiLogin,
  getCurrentUser,
  setTokens,
  clearTokens,
  isAuthenticated,
  type UserInfo,
} from './api.js';

interface AuthState {
  user: UserInfo | null;
  isLoading: boolean;
  /** true while we attempt to restore session from stored token */
  isRestoring: boolean;
}

interface AuthContextValue extends Omit<AuthState, 'isRestoring'> {
  isRestoring: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }){
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: false,
    isRestoring: isAuthenticated(),
  });

  // On mount: if we have a stored token, fetch current user to restore session
  useEffect(() => {
    if (!isAuthenticated()) return;

    let cancelled = false;
    getCurrentUser()
      .then((user) => {
        if (!cancelled) setState({ user, isLoading: false, isRestoring: false });
      })
      .catch(() => {
        // Token expired or invalid — clear it
        clearTokens();
        if (!cancelled) setState({ user: null, isLoading: false, isRestoring: false });
      });

    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setState((s) => ({ ...s, isLoading: true }));
    try {
      const data = await apiLogin(email, password);
      setTokens(data.accessToken, data.refreshToken);
      setState({ user: data.user, isLoading: false, isRestoring: false });
    } catch (err) {
      setState((s) => ({ ...s, isLoading: false }));
      throw err;
    }
  }, []);

  const logout = useCallback(() => {
    clearTokens();
    setState({ user: null, isLoading: false, isRestoring: false });
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
