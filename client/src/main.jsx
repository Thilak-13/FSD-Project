import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import Layout from './components/Layout';
import { ToastProvider } from './components/Toast';
import Login from './pages/Login';
import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';
import Invoices from './pages/Invoices';
import InvoiceDetail from './pages/InvoiceDetail';
import InvoiceForm from './pages/InvoiceForm';
import Vendors from './pages/Vendors';
import VendorDetail from './pages/VendorDetail';
import PurchaseOrders from './pages/PurchaseOrders';
import PurchaseOrderDetail from './pages/PurchaseOrderDetail';
import Reports from './pages/Reports';
import Users from './pages/Users';
import './styles.css';
import './theme.css';

// Pages each role can open; the server enforces the same split on every request.
const PAGES = {
  admin: ['/users'],
  vendor: ['/', '/invoices', '/purchase-orders'],
  finance: ['/', '/invoices', '/vendors', '/purchase-orders', '/reports'],
  manager: ['/', '/invoices', '/vendors', '/purchase-orders', '/reports'],
};
// Writing or fixing a bill is the vendor's job, so only vendors open the invoice form.
const canOpen = (role, path) => (role === 'vendor' || !/^\/invoices\/(new|[^/]+\/edit)$/.test(path))
  && (PAGES[role] || []).some((p) => (p === '/' ? path === '/' : path === p || path.startsWith(`${p}/`)));

function Protected() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  if (user && !canOpen(user.role, pathname)) return <Navigate to={PAGES[user.role]?.[0] || '/login'} replace />;
  if (user) return <Layout />;
  // Logged-out visitors get the landing page at "/", and the login page everywhere else.
  return pathname === '/' ? <Landing /> : <Navigate to="/login" replace />;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <AuthProvider>
    <ToastProvider>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<Protected />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/invoices" element={<Invoices />} />
          <Route path="/invoices/new" element={<InvoiceForm key="new" />} />
          <Route path="/invoices/:id" element={<InvoiceDetail />} />
          <Route path="/invoices/:id/edit" element={<InvoiceForm key="edit" />} />
          <Route path="/vendors" element={<Vendors />} />
          <Route path="/vendors/:id" element={<VendorDetail />} />
          <Route path="/purchase-orders" element={<PurchaseOrders />} />
          <Route path="/purchase-orders/:id" element={<PurchaseOrderDetail />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/users" element={<Users />} />
        </Route>
      </Routes>
    </BrowserRouter>
    </ToastProvider>
  </AuthProvider>
);
