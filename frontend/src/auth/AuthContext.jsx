import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, tokenStore } from '../api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(() => Boolean(tokenStore.get()));

  useEffect(() => {
    if (!tokenStore.get()) return;
    api('/auth/me')
      .then(setUser)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // api.js emite este evento cuando el backend responde 401 con un token guardado.
  useEffect(() => {
    const onLogout = () => setUser(null);
    window.addEventListener('auth:logout', onLogout);
    return () => window.removeEventListener('auth:logout', onLogout);
  }, []);

  const startSession = useCallback(({ token, user }) => {
    tokenStore.set(token);
    setUser(user);
  }, []);

  const login = useCallback(
    async (email, password) => startSession(await api('/auth/login', { method: 'POST', body: { email, password } })),
    [startSession],
  );

  const setup = useCallback(
    async (data) => startSession(await api('/auth/setup', { method: 'POST', body: data })),
    [startSession],
  );

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, loading, login, setup, logout }), [user, loading, login, setup, logout]);
  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth() {
  return useContext(AuthContext);
}
