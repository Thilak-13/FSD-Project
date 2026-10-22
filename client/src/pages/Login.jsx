import { useEffect, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth, DEMO_USERS, DEMO_PASSWORD } from '../auth';
import { errMsg } from '../api';
import useTitle from '../useTitle';
import LoginScene from './LoginScene';
import './login-scene.css';

const FLOW = [
  { title: 'Finance enters the invoice', text: 'Upload the bill and link its purchase order.' },
  { title: 'The system checks it', text: 'Vendor, duplicates, dates and PO amount are verified instantly.' },
  { title: 'A manager approves', text: 'Only clean invoices reach the approver, with every check shown.' },
  { title: 'Finance pays and it closes', text: 'Partial or full payments, with reminders before anything goes overdue.' },
];

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const Eye = ({ off }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />
    {off && <path d="M4 4l16 16" />}
  </svg>
);

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5Z" />
    <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7Z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44Z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5Z" />
  </svg>
);

export default function Login() {
  const { user, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [reduced] = useState(reducedMotion);
  const video = useRef(null);
  useTitle('Sign in');
  useEffect(() => {
    if (paused) return undefined;
    const t = setInterval(() => setStep((i) => (i + 1) % FLOW.length), 4500);
    return () => clearInterval(t);
  }, [paused]);
  useEffect(() => {
    const v = video.current;
    if (!v) return undefined;
    const sync = () => (paused || document.hidden ? v.pause() : v.play().catch(() => {}));
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, [paused]);
  if (user) return <Navigate to="/" replace />;

  const go = async (e, p, who) => {
    setBusy(who); setError(''); setNote('');
    try { await login(e, p); } catch (err) { setError(errMsg(err)); setBusy(''); }
  };
  const tell = (text) => { setError(''); setNote(text); };

  return (
    <div className="login-page" role="main">
      <section className="login-hero">
        {/* SVG scene is the fallback until /login/bg.mp4 exists */}
        <LoginScene paused={paused} />
        <img className="hero-media" src="/login/poster.jpg" alt="" onError={(e) => { e.currentTarget.hidden = true; }} />
        {!reduced && (
          <video ref={video} className={`hero-media hero-video${videoReady ? ' ready' : ''}`} autoPlay muted loop playsInline
            poster="/login/poster.jpg" aria-hidden="true" onLoadedData={() => setVideoReady(true)}>
            <source src="/login/bg.webm" type="video/webm" />
            <source src="/login/bg.mp4" type="video/mp4" />
          </video>
        )}
        <div className="hero-shade" />

        <Link to="/" className="brand light hero-logo"><span className="brand-mark" aria-hidden="true" />InvoiceFlow</Link>
        <div className="hero-copy">
          <p className="eyebrow">Accounts payable, automated</p>
          <h1>Every invoice, from inbox to <span className="grad">paid</span>.</h1>
          <p className="hero-sub">Capture, check, approve and pay vendor bills in one place, without chasing anyone.</p>
          <div className="story-card" aria-live={paused ? 'polite' : 'off'}>
            <div key={step} className="story-step">
              <span className="step">Step {step + 1} of {FLOW.length}</span>
              <b>{FLOW[step].title}</b>
              <p>{FLOW[step].text}</p>
            </div>
          </div>
          <div className="story-dots">
            {FLOW.map((f, i) => (
              <button key={f.title} aria-label={`Show step ${i + 1}`} aria-current={i === step} onClick={() => setStep(i)} />
            ))}
          </div>
        </div>
        <button className="scene-toggle" onClick={() => setPaused((p) => !p)} aria-label={paused ? 'Play animation' : 'Pause animation'}>
          {paused ? '▶' : '❚❚'}
        </button>
      </section>

      <section className="login-panel">
        <div className="login-form">
          <h2>Welcome back</h2>
          <p className="login-lede">Sign in to your workspace</p>

          <form onSubmit={(e) => { e.preventDefault(); go(email, password, 'form'); }}>
            <label className="field">
              <span className="field-label">Email</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username"
                placeholder="you@company.com" aria-invalid={!!error} required />
            </label>
            <div className="field">
              <span className="field-label">
                <label htmlFor="login-pw">Password</label>
                <button type="button" className="link-btn" onClick={() => tell('Ask an admin to reset your password from the Users page.')}>Forgot?</button>
              </span>
              <div className="pw-wrap">
                <input id="login-pw" type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password" placeholder="Your password" aria-invalid={!!error} aria-describedby="login-msg" required />
                <button type="button" className="pw-eye" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}>
                  <Eye off={show} />
                </button>
              </div>
              {/* fixed-height slot so a message never moves the button */}
              <p id="login-msg" className={`field-msg${error ? ' bad' : ''}`} role={error ? 'alert' : 'status'}>
                {error && <span aria-hidden="true">!</span>}{error || note}
              </p>
            </div>
            <button className="login-submit" disabled={!!busy}>
              {busy === 'form' ? <span className="spinner light" role="status" aria-label="Signing in" /> : 'Sign in'}
            </button>
          </form>

          <div className="or"><span>or</span></div>
          <button type="button" className="login-google" onClick={() => tell('Google sign-in is not connected yet. Use email or a demo role.')}>
            <GoogleIcon />Continue with Google
          </button>

          <div className="demo-chips" aria-busy={!!busy}>
            <span>Try as</span>
            {DEMO_USERS.map((d) => (
              <button key={d.role} type="button" disabled={!!busy} title={d.does} onClick={() => go(d.email, DEMO_PASSWORD, d.role)}>
                {busy === d.role ? <span className="spinner" role="status" aria-label="Signing in" /> : <i aria-hidden="true">{d.name[0]}</i>}
                {d.role[0].toUpperCase() + d.role.slice(1)}
              </button>
            ))}
          </div>

          <p className="login-foot">Don't have an account? <button type="button" className="link-btn" onClick={() => tell('Accounts are created by an admin. Ask yours for an invite.')}>Sign up</button></p>
        </div>
        <p className="login-legal">© 2026 InvoiceFlow · Demo workspace</p>
      </section>
    </div>
  );
}
