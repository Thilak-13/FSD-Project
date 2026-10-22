import { useEffect, useRef, useState, Fragment } from 'react';
import { NavLink, Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import api from '../api';
import { useAuth, DEMO_USERS, DEMO_PASSWORD } from '../auth';
import { useToast } from './Toast';
import { date } from '../format';
import '../a11y.css';

// Calls onEscape when Escape is pressed while `active` is true.
function useEscape(active, onEscape) {
  useEffect(() => {
    if (!active) return;
    const h = (e) => e.key === 'Escape' && onEscape();
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [active, onEscape]);
}

function Bell() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const ref = useRef();
  const btn = useRef();
  const { pathname } = useLocation();
  const load = () => api.get('/notifications').then((r) => setItems(r.data)).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [pathname]);
  useEffect(() => {
    const close = (e) => open && !ref.current?.contains(e.target) && setOpen(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [open]);
  useEscape(open, () => { setOpen(false); btn.current?.focus(); });
  const unread = items.filter((n) => !n.read).length;

  const toggle = () => {
    if (!open && unread) api.post('/notifications/read-all');
    if (open) load();
    setOpen(!open);
  };

  return (
    <div className="bell" ref={ref}>
      <button ref={btn} className="icon-btn" onClick={toggle} aria-label={`Alerts, ${unread} new`} aria-expanded={open} aria-controls="alerts-panel">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
        {unread > 0 && <span className="count" aria-hidden="true">{unread}</span>}
      </button>
      {open && (
        <div className="dropdown" id="alerts-panel" role="region" aria-labelledby="alerts-head">
          <h2 className="dropdown-head" id="alerts-head">Alerts and reminders</h2>
          <ul>
            {items.length === 0 && <li className="muted">You're all caught up.</li>}
            {items.map((n) => (
              <li key={n._id} className={n.read ? '' : 'unread'}>
                <Link to={`/invoices/${n.invoice}`} onClick={() => setOpen(false)}>{n.read ? '' : <span className="sr-only">New: </span>}{n.message}</Link>
                <small>{date(n.createdAt)}</small>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function RoleSwitcher() {
  const { user, login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const isDemo = DEMO_USERS.some((d) => d.role === user.role);
  if (!isDemo) return null;

  const switchTo = async (e) => {
    const demo = DEMO_USERS.find((d) => d.role === e.target.value);
    try {
      const u = await login(demo.email, DEMO_PASSWORD);
      toast(`Now viewing as ${u.name}, ${u.role}`);
      navigate('/');
    } catch { toast('Demo account not found. Run npm run seed on the server.', 'bad'); }
  };

  return (
    <label className="switcher">
      <span>View as</span>
      <select value={user.role} onChange={switchTo}>
        {DEMO_USERS.map((d) => <option key={d.role} value={d.role}>{d.name} ({d.role})</option>)}
      </select>
    </label>
  );
}

const Icon = ({ d }) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;

// Breadcrumbs from the URL: section › page.
const SECTIONS = { invoices: 'Invoices', vendors: 'Vendors', 'purchase-orders': 'Purchase orders', reports: 'Reports', users: 'Users' };
function Crumbs({ pathname }) {
  const [, section, id, action] = pathname.split('/');
  const trail = [{ label: 'Home', to: '/' }];
  if (section) trail.push({ label: SECTIONS[section] || section, to: `/${section}` });
  if (id) trail.push({ label: id === 'new' ? 'New invoice' : action === 'edit' ? 'Fix invoice' : section === 'vendors' ? 'Vendor' : 'Invoice' });
  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      {trail.map((c, i) => (
        <Fragment key={c.label}>
          {i > 0 && <span className="sep" aria-hidden="true">/</span>}
          {i === trail.length - 1 ? <span aria-current="page">{c.label}</span> : <Link to={c.to}>{c.label}</Link>}
        </Fragment>
      ))}
    </nav>
  );
}

export default function Layout() {
  const { user, logout, can } = useAuth();
  const [menu, setMenu] = useState(false);
  const { pathname } = useLocation();
  const mainRef = useRef();
  const menuBtn = useRef();
  const first = useRef(true);
  useEscape(menu, () => { setMenu(false); menuBtn.current?.focus(); });
  // On navigation, close the mobile menu and move focus to the new page so screen readers announce it.
  useEffect(() => {
    setMenu(false);
    if (first.current) { first.current = false; return; }
    mainRef.current?.focus({ preventScroll: true });
  }, [pathname]);

  return (
    <div className="shell">
      <a href="#main" className="skip-link">Skip to main content</a>
      <aside className={menu ? 'open' : ''} id="sidebar" aria-label="Sidebar">
        <Link to="/" className="brand" aria-label="InvoiceFlow home">
          <span className="brand-mark" aria-hidden="true" />
          InvoiceFlow
        </Link>
        <nav aria-label="Main">
          <div className="nav-group" aria-hidden="true">Overview</div>
          <NavLink to="/" end><Icon d="M3 12l9-9 9 9M5 10v10h14V10" />Home</NavLink>
          <div className="nav-group" aria-hidden="true">Invoices</div>
          <NavLink to="/invoices" className={({ isActive }) => (isActive && !pathname.endsWith('/new') ? 'active' : '')}><Icon d="M6 2h9l5 5v15H6zM14 2v6h6M9 13h6M9 17h6" />All invoices</NavLink>
          {can('finance') && <NavLink to="/invoices/new" className="nav-cta"><Icon d="M12 5v14M5 12h14" />New invoice</NavLink>}
          <div className="nav-group" aria-hidden="true">Vendors and POs</div>
          <NavLink to="/vendors"><Icon d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6" />Vendors</NavLink>
          <NavLink to="/purchase-orders"><Icon d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2 2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2M9 14l2 2 4-4" />Purchase orders</NavLink>
          {can('finance', 'manager') && <div className="nav-group" aria-hidden="true">Insights</div>}
          {can('finance', 'manager') && <NavLink to="/reports"><Icon d="M3 3v18h18M7 15l4-4 3 3 5-6" />Reports</NavLink>}
          {can() && <div className="nav-group" aria-hidden="true">Admin</div>}
          {can() && <NavLink to="/users"><Icon d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />Users</NavLink>}
        </nav>
        <div className="aside-foot">
          <RoleSwitcher />
          <button className="link-btn" onClick={logout}>Log out</button>
        </div>
      </aside>
      <div className="main-col">
        <header className="topbar">
          <button ref={menuBtn} className="icon-btn menu-btn" onClick={() => setMenu(!menu)} aria-label="Menu" aria-expanded={menu} aria-controls="sidebar">
            <Icon d="M3 6h18M3 12h18M3 18h18" />
          </button>
          <Crumbs pathname={pathname} />
          <div className="topbar-right">
            {can('finance') && !pathname.endsWith('/new') && <Link to="/invoices/new" className="btn primary">New invoice</Link>}
            <Bell />
            <div className="who">
              <span className="avatar" aria-hidden="true">{user.name[0]}</span>
              <span><b>{user.name}</b><small>{user.role}</small></span>
            </div>
          </div>
        </header>
        <main id="main" ref={mainRef} tabIndex={-1}><Outlet /></main>
      </div>
    </div>
  );
}
