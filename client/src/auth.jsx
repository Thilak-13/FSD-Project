import { createContext, useContext, useState } from 'react';
import api from './api';

const AuthContext = createContext(null);

// Seeded demo accounts (see server/seed.js), for one-click login while presenting.
export const DEMO_USERS = [
  { role: 'vendor', email: 'vendor@demo.com', name: 'Ravi', does: 'Sends bills for Globex Logistics' },
  { role: 'finance', email: 'finance@demo.com', name: 'Farid', does: 'Reviews bills and pays vendors' },
  { role: 'manager', email: 'manager@demo.com', name: 'Meera', does: 'Approves or rejects invoices' },
  { role: 'admin', email: 'admin@demo.com', name: 'Asha', does: 'Manages the vendor, finance and manager accounts' },
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
  // Mirrors the server's requireRole: each role does only its own job.
  const can = (...roles) => !!user && roles.includes(user.role);
  // Vendor users see a smaller portal: only their own bills and POs.
  const isVendor = user?.role === 'vendor';

  return <AuthContext.Provider value={{ user, login, logout, can, isVendor }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
