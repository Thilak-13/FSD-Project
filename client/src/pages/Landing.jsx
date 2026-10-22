import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth, DEMO_USERS, DEMO_PASSWORD } from '../auth';
import { errMsg } from '../api';
import useTitle from '../useTitle';
import './landing.css';

const CHECKS = [
  'Vendor is registered and active',
  'Not a duplicate of an earlier invoice',
  'Amount is valid',
  'Due date is after the invoice date',
  'Within PO-1003 (₹90,000, 2% tolerance)',
];

// Hero demo timeline: one invoice moving through the real flow.
// Steps 1–5 tick the checks, 6 sends it for approval, 7 approves, 8 pays, 9 shows a reminder.
const LAST = 9;
const STAGE = (s) => (s < 6 ? 'Checking' : s === 6 ? 'Waiting for approval' : s === 7 ? 'Ready to pay' : 'Paid');
const TONE = (s) => (s < 6 ? 'neutral' : s === 6 ? 'wait' : s === 7 ? 'pay' : 'ok');

function HeroDemo() {
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const [step, setStep] = useState(reduced ? LAST : 0);
  const [run, setRun] = useState(0);

  useEffect(() => {
    if (reduced) return;
    setStep(0);
    const delays = [600, 450, 450, 450, 450, 900, 1300, 1300, 1200];
    let t = 0;
    const timers = delays.map((d, i) => setTimeout(() => setStep(i + 1), (t += d)));
    return () => timers.forEach(clearTimeout);
  }, [run, reduced]);

  const journey = ['Submitted', 'Checked', 'Approved', 'Paid'];
  const reached = [true, step >= 6, step >= 7, step >= 8];

  return (
    <div className="lp-demo" aria-label="Example: invoice SFS-2318 being checked, approved and paid">
      <div className="lp-card">
        <div className="lp-card-head">
          <div>
            <b>SFS-2318</b>
            <span>Sunrise Facility Services</span>
          </div>
          <span className={`badge ${TONE(step)}`}>{STAGE(step)}</span>
        </div>
        <div className="lp-amount">₹24,000<small>{step >= 8 ? 'paid in full' : 'due in 22 days'}</small></div>

        <ol className="lp-track" aria-hidden="true">
          {journey.map((j, i) => <li key={j} className={reached[i] ? 'on' : ''}><span />{j}</li>)}
        </ol>

        <ul className="lp-checks">
          {CHECKS.map((c, i) => (
            <li key={c} className={step > i ? 'done' : ''}>
              <span className="lp-tick" aria-hidden="true">{step > i ? '✓' : ''}</span>{c}
            </li>
          ))}
        </ul>

        <div className={`lp-row ${step >= 7 ? 'show' : ''}`}>
          <span className="avatar" aria-hidden="true">M</span>
          <span><b>Approved by Meera</b><small>Manager, after reviewing the bill</small></span>
        </div>
        <div className={`lp-row ${step >= 8 ? 'show' : ''}`}>
          <span className="lp-pay" aria-hidden="true">₹</span>
          <span><b>Paid ₹24,000 by NEFT</b><small>UTR 4471 0233, recorded by Farid</small></span>
        </div>
      </div>

      <div className={`lp-alert ${step >= LAST ? 'show' : ''}`} aria-hidden={step < LAST}>
        <b>Reminder</b>
        GLX-311 from Globex Logistics is due in 2 days.
      </div>

      {!reduced && (
        <button className="lp-replay" onClick={() => setRun((r) => r + 1)} disabled={step < LAST}>
          Replay
        </button>
      )}
    </div>
  );
}

const COMPARE = [
  ['Invoices arrive by email and WhatsApp, and someone retypes them into a sheet', 'Finance enters each bill once, with the PDF attached to it'],
  ['Duplicates and over-billing are caught, if at all, after payment', 'Five checks run the moment it is entered, including the PO amount'],
  ['Approvals wait in someone\'s inbox while the due date passes', 'The manager gets an alert and approves with the bill on screen'],
  ['"Has this been paid?" means scrolling through bank statements', 'Every payment, part or full, is recorded against its invoice'],
  ['Month-end means building the overdue list by hand', 'Reports show what is owed, to whom, and how late, at any time'],
];

const FAQ = [
  ['What does InvoiceFlow check automatically?',
    'That the vendor is active, the invoice number has not been used before for that vendor, the amount is valid, the due date is after the invoice date and, if a purchase order is linked, that the total invoiced stays within the PO amount plus 2%.'],
  ['What happens when an invoice fails a check?',
    'It goes back to Finance marked "Needs fixing", with the reason. They correct it and resubmit, and the checks run again. It never reaches a manager until it passes.'],
  ['Can the person who entered an invoice also approve it?',
    'No. Whoever entered an invoice cannot approve or reject it, not even an admin. Entering and approving stay with different people.'],
  ['Can we pay an invoice in parts?',
    'Yes. Record each payment with its date, method and UTR or cheque number. The invoice shows how much is still to pay and can never be overpaid.'],
  ['Who gets reminded, and when?',
    'Finance is reminded three days before an invoice is due. Finance and Admin are alerted once it is overdue. Managers are nudged when an invoice has waited more than two days for approval. Nobody gets the same reminder twice in a day.'],
  ['Does it move money?',
    'No. Payments are made from your bank as usual; InvoiceFlow records them so everyone can see what is paid and what is still owed.'],
];

export default function Landing() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  useTitle('Vendor invoices, checked and paid on time');

  const tryAs = async (d) => {
    setBusy(d.role); setError('');
    try { await login(d.email, DEMO_PASSWORD); navigate('/'); }
    catch (e) { setError(errMsg(e)); setBusy(''); }
  };

  return (
    <div className="lp">
      <a href="#lp-main" className="skip-link">Skip to main content</a>
      <header className="lp-nav">
        <Link to="/" className="brand"><span className="brand-mark" aria-hidden="true" />InvoiceFlow</Link>
        <nav aria-label="Page sections">
          <a href="#how">How it works</a>
          <a href="#features">Features</a>
          <a href="#faq">Questions</a>
        </nav>
        <Link to="/login" className="lp-btn ghost">Sign in</Link>
      </header>

      <main id="lp-main">
        <section className="lp-hero">
          <div className="lp-hero-copy">
            <h1>Stop chasing invoices for approval.</h1>
            <p>
              InvoiceFlow checks every vendor bill against its purchase order, sends it to the right
              approver and reminds your team before anything goes overdue. From the bill arriving to
              the vendor being paid, everyone can see where it stands.
            </p>
            <div className="lp-ctas">
              <a href="#try" className="lp-btn primary">Try the live demo</a>
              <a href="#how" className="lp-btn light">See how it works</a>
            </div>
            <dl className="lp-facts">
              <div><dt>5</dt><dd>checks on every invoice, before anyone approves it</dd></div>
              <div><dt>2%</dt><dd>tolerance against the purchase order, then it is flagged</dd></div>
              <div><dt>3 days</dt><dd>before the due date, finance gets a reminder</dd></div>
            </dl>
          </div>
          <HeroDemo />
        </section>

        <section className="lp-section" aria-labelledby="compare-h">
          <div className="lp-head">
            <h2 id="compare-h">Where invoices get stuck today, and what changes</h2>
            <p>Most teams already have an approval process. It just lives in inboxes and spreadsheets, where nobody can see it.</p>
          </div>
          <div className="lp-compare">
            <div className="lp-col before">
              <h3>Spreadsheets, email and calls</h3>
              <ul>{COMPARE.map(([b]) => <li key={b}>{b}</li>)}</ul>
            </div>
            <div className="lp-col after">
              <h3>With InvoiceFlow</h3>
              <ul>{COMPARE.map(([, a]) => <li key={a}>{a}</li>)}</ul>
            </div>
          </div>
        </section>

        <section className="lp-section" id="how" aria-labelledby="how-h">
          <div className="lp-head">
            <h2 id="how-h">How an invoice moves</h2>
            <p>Each stage belongs to one person, and the next person is told as soon as it is their turn.</p>
          </div>
          <ol className="lp-route">
            <li><b>Enter</b><span>Finance types in the bill, links the PO and attaches the PDF.</span></li>
            <li><b>Check</b><span>The system runs five checks in under a second. Failures go straight back with the reason.</span></li>
            <li><b>Approve</b><span>A manager sees the checks and the bill side by side, then approves or rejects with a note.</span></li>
            <li><b>Pay</b><span>Finance records full or part payments. The invoice closes when the balance reaches zero.</span></li>
          </ol>
        </section>

        <section className="lp-section" id="features" aria-labelledby="feat-h">
          <div className="lp-head">
            <h2 id="feat-h">Built around the questions finance teams get asked</h2>
          </div>

          <div className="lp-feature">
            <div className="lp-feature-copy">
              <h3>"Is this bill even right?"</h3>
              <p>Over-billing against a purchase order, a bill entered twice, a vendor you stopped working with: each is caught when the invoice is entered, not after the money has gone.</p>
            </div>
            <div className="lp-feature-ui" aria-hidden="true">
              <div className="lp-mini">
                <div className="lp-mini-title">Automatic checks <span className="badge bad">Needs fixing</span></div>
                <ul className="lp-checks static">
                  <li className="done"><span className="lp-tick">✓</span>Vendor is registered and active</li>
                  <li className="fail"><span className="lp-tick">✕</span>Exceeds PO-1002: ₹1,25,000 invoiced vs ₹1,20,000</li>
                  <li className="done"><span className="lp-tick">✓</span>Due date is after the invoice date</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="lp-feature flip">
            <div className="lp-feature-copy">
              <h3>"Who is holding this up?"</h3>
              <p>Every invoice shows its next step and whose turn it is. Managers get an alert the moment something needs them, and a reminder if it has waited more than two days.</p>
            </div>
            <div className="lp-feature-ui" aria-hidden="true">
              <div className="lp-mini">
                <div className="lp-mini-title">Waiting for approval</div>
                <div className="lp-wait"><b>GLX-312</b><span>Globex Logistics</span><em className="late">4 days</em></div>
                <div className="lp-wait"><b>NWE-0462</b><span>Northwind Electricals</span><em>1 day</em></div>
                <div className="lp-mini-note">Meera has been reminded about GLX-312.</div>
              </div>
            </div>
          </div>

          <div className="lp-feature">
            <div className="lp-feature-copy">
              <h3>"How much do we owe, and how late is it?"</h3>
              <p>Outstanding amounts by vendor and by how many days overdue, payments per month and how long approvals really take, with a CSV export for your accountant.</p>
            </div>
            <div className="lp-feature-ui" aria-hidden="true">
              <div className="lp-mini">
                <div className="lp-mini-title">Still owed, by age</div>
                <div className="lp-bars">
                  {[['Not yet due', 81, '#8a94a6'], ['0–30 days', 35, '#d9a13b'], ['31–60 days', 0, '#d97a2b'], ['61–90 days', 8, '#c4501f']].map(([l, v, c]) => (
                    <div key={l} className="lp-bar"><span>{l}</span><i style={{ width: `${(v / 81) * 100}%`, background: c }} /><b>₹{v}k</b></div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="lp-section lp-try" id="try" aria-labelledby="try-h">
          <div className="lp-head">
            <h2 id="try-h">Try it from each seat</h2>
            <p>The demo is loaded with real-looking invoices at every stage. Pick a role to sign in; you can switch roles from the sidebar at any time.</p>
          </div>
          <div className="lp-roles">
            {DEMO_USERS.map((d) => (
              <button key={d.role} className="lp-role" onClick={() => tryAs(d)} disabled={!!busy}>
                <span className="avatar" aria-hidden="true">{d.name[0]}</span>
                <b>{d.name}, {d.role}</b>
                <span>{d.does}</span>
                <span className="lp-role-go">{busy === d.role ? 'Signing in…' : `Sign in as ${d.name}`}</span>
              </button>
            ))}
          </div>
          {error && <p className="error" role="alert">{error}</p>}
        </section>

        <section className="lp-section" id="faq" aria-labelledby="faq-h">
          <div className="lp-head"><h2 id="faq-h">Questions</h2></div>
          <div className="lp-faq">
            {FAQ.map(([q, a]) => (
              <details key={q}>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="lp-end">
          <h2>Get your next invoice from bill to paid without a single follow-up call.</h2>
          <div className="lp-ctas">
            <a href="#try" className="lp-btn primary">Try the live demo</a>
            <Link to="/login" className="lp-btn light">Sign in</Link>
          </div>
        </section>
      </main>

      <footer className="lp-foot">
        <span className="brand"><span className="brand-mark" aria-hidden="true" />InvoiceFlow</span>
        <span>Invoice verification and vendor payment tracking. A full-stack project built with MongoDB, Express, React and Node.</span>
      </footer>
    </div>
  );
}
