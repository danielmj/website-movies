import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      const u = await api.get('/api/auth/me');
      setUser(u && typeof u === 'object' && u.id ? u : null);
      return u;
    } catch {
      setUser(null);
      return null;
    }
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  const value = {
    user,
    loading,
    refresh,
    async login(email, password) {
      await api.post('/api/auth/login', { email, password });
      return refresh();
    },
    async signup(name, email, password) {
      await api.post('/api/auth/signup', { name, email, password });
      return refresh();
    },
    async logout() {
      await api.post('/api/auth/logout');
      setUser(null);
    },
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  return useContext(AuthCtx);
}
