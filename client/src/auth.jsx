import { createContext, useContext, useState } from 'react';
import api from './api';

const AuthContext = createContext(null);

// Seeded demo accounts (see server/seed.js), for one-click login while presenting.
export const DEMO_USERS = [
  { role: 'finance', email: 'finance@demo.com', name: 'Farid', does: 'Enters invoices and pays vendors' },
  { role: 'manager', email: 'manager@demo.com', name: 'Meera', does: 'Approves or rejects invoices' },
  { role: 'admin', email: 'admin@demo.com', name: 'Asha', does: 'Oversees everything, manages users' },
];
export const DEMO_PASSWORD = 'password123';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('user') || 'null'));

  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  };
  const logout = () => { localStorage.clear(); setUser(null); };
  // Admin can do everything, mirroring the server's requireRole.
  const can = (...roles) => !!user && (user.role === 'admin' || roles.includes(user.role));

  return <AuthContext.Provider value={{ user, login, logout, can }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
