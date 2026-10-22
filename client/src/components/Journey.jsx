import { date, paidOf } from '../format';

// Per-invoice progress: Submitted → Checked → Approved → Paid.
function steps(inv) {
  const s = inv.status;
  const pct = Math.round((paidOf(inv) / inv.amount) * 100);
  const after = (list) => list.includes(s);
  return [
    { name: 'Submitted', state: 'done', when: inv.submittedAt || inv.createdAt },
    { name: 'Checked', state: s === 'verification_failed' ? 'failed' : 'done', when: inv.submittedAt,
      note: s === 'verification_failed' ? 'Some checks failed' : 'All checks passed' },
    { name: 'Approved', state: s === 'rejected' ? 'failed' : s === 'pending_approval' ? 'current' : after(['approved', 'partially_paid', 'paid']) ? 'done' : 'todo',
      when: inv.approvedAt, note: s === 'rejected' ? 'Rejected by manager' : s === 'pending_approval' ? 'Waiting for manager' : null },
    { name: 'Paid', state: s === 'paid' ? 'done' : after(['approved', 'partially_paid']) ? 'current' : 'todo',
      when: inv.paidAt, note: s === 'partially_paid' ? `${pct}% paid` : s === 'approved' ? 'Waiting for payment' : null },
  ];
}

export default function Journey({ invoice }) {
  return (
    <ol className="journey" aria-label="Invoice progress">
      {steps(invoice).map((st) => (
        <li key={st.name} className={st.state}>
          <span className="dot" aria-hidden="true">{st.state === 'done' ? '✓' : st.state === 'failed' ? '!' : ''}</span>
          <b>{st.name}</b>
          <small>{st.state === 'done' && st.when ? date(st.when) : st.note || ' '}</small>
        </li>
      ))}
    </ol>
  );
}
