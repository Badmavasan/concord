import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

const Ctx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { api('/auth/me').then(d => setUser(d.user)).catch(() => {}).finally(() => setLoading(false)); }, []);
  const login = async (body) => { const d = await api('/auth/login', { method: 'POST', body }); setUser(d.user); return d; };
  const register = async (body) => { const d = await api('/auth/register', { method: 'POST', body }); setUser(d.user); return d; };
  const logout = async () => { await api('/auth/logout', { method: 'POST' }); setUser(null); };
  register.refresh = () => api('/auth/me').then(d => setUser(d.user));
  return <Ctx.Provider value={{ user, loading, login, register, logout }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
