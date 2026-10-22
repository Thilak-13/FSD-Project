import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth, DEMO_USERS, DEMO_PASSWORD } from '../auth';
import { errMsg } from '../api';
import { money } from '../format';
import useTitle from '../useTitle';
import { CHECK_TITLES } from './InvoiceDetail';
import './login.css';

// Sample bill shown on the left; totals must add up because people will read them.
const LINES = [
  ['MS angle 50×50×6 mm, 1.2 t', 78600],
  ['Cutting and loading', 4200],
];
const SUBTOTAL = LINES.reduce((s, [, a]) => s + a, 0);
const GST = SUBTOTAL * 0.18;

export default function Login() {
  const { user, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  useTitle('Sign in');
  if (user) return <Navigate to="/" replace />;

  const go = async (e, p, who) => {
    setBusy(who); setError('');
    try { await login(e, p); } catch (err) { setError(errMsg(err)); setBusy(''); }
  };

  return (
    <div className="signin" role="main">
      <section className="signin-book">
        <Link to="/" className="signin-logo"><span className="brand-mark" aria-hidden="true" />InvoiceFlow</Link>
        <h1>Bills in. Payments out. Nobody chasing.</h1>
        <p className="signin-intro">Every bill is checked against its vendor and purchase order before a manager ever sees it.</p>

        <figure className="bill" aria-label="Example: a vendor bill passing every check and getting approved">
          <div className="bill-copy" aria-hidden="true" />
          <div className="bill-sheet">
            <header>
              <div><b>Kaveri Steel Traders</b><span>Tax invoice KST/25-26/0412</span></div>
              <span>PO 1186</span>
            </header>
            <table>
              <tbody>
                {LINES.map(([item, amt]) => <tr key={item}><td>{item}</td><td>{money(amt)}</td></tr>)}
                <tr><td>GST 18%</td><td>{money(GST)}</td></tr>
              </tbody>
              <tfoot><tr><td>Total</td><td>{money(SUBTOTAL + GST)}</td></tr></tfoot>
            </table>
            <ul className="bill-checks">
              {Object.entries(CHECK_TITLES).map(([rule, title], i) => (
                <li key={rule} style={{ '--i': i }}>{title}</li>
              ))}
            </ul>
            <span className="bill-stamp">Approved</span>
          </div>
        </figure>
      </section>

      <section className="signin-form">
        <div className="signin-col">
          <h2>Sign in</h2>
          <form onSubmit={(e) => { e.preventDefault(); go(email, password, 'form'); }}>
            <label>Work email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" aria-invalid={!!error} required />
            </label>
            <label>Password
              <span className="pw">
                <input type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password" aria-invalid={!!error} aria-describedby="signin-error" required />
                <button type="button" onClick={() => setShow((s) => !s)} aria-pressed={show}>{show ? 'Hide' : 'Show'}</button>
              </span>
            </label>
            <p id="signin-error" className="signin-error" role="alert">{error}</p>
            <button className="signin-submit" disabled={!!busy}>
              {busy === 'form' ? <span className="spinner light" role="status" aria-label="Signing in" /> : 'Sign in'}
            </button>
          </form>

          <h3>Or look around with sample data</h3>
          <div className="signin-demo" aria-busy={!!busy}>
            {DEMO_USERS.map((d) => (
              <button key={d.role} type="button" disabled={!!busy} onClick={() => go(d.email, DEMO_PASSWORD, d.role)}>
                <span><b>{d.name}, {d.role}</b>{d.does}</span>
                {busy === d.role ? <span className="spinner" role="status" aria-label="Signing in" /> : <span aria-hidden="true" className="signin-go">Open</span>}
              </button>
            ))}
          </div>
          <p className="signin-note">New to your team's workspace? An admin adds you from the Users page.</p>
        </div>
      </section>
    </div>
  );
}
