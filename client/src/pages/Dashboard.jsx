import { Link } from 'react-router-dom';
import { useLoad } from '../api';
import { useAuth } from '../auth';
import Route from '../components/Route';
import { money, dueText, balanceOf, isOverdue, daysSince, daysUntil, WITH_VENDOR } from '../format';
import { poLimit } from '../../../server/services/verify.js';
import useTitle from '../useTitle';

function TaskGroup({ title, hint, items, action, detail, empty }) {
  return (
    <section className="task-group">
      <h3>{title} <span className="pill">{items.length}</span></h3>
      <p className="muted small">{hint}</p>
      {items.length === 0 ? <p className="empty-line">{empty}</p> : (
        <ul className="tasks">
          {items.map((i) => (
            <li key={i._id}>
              <Link to={`/invoices/${i._id}`} className="task">
                <span className="task-main">
                  <b>{i.invoiceNumber}</b>
                  <span className="muted">{i.vendor?.name}</span>
                </span>
                <span className={`task-detail ${isOverdue(i) ? 'late' : ''}`}>{detail(i)}</span>
                <span className="task-amount">{money(balanceOf(i))}</span>
                <span className="btn small">{action}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function Dashboard() {
  const { can, isVendor } = useAuth();
  // Everything here is worked out from the invoice list, which the server already limits to a vendor's own bills.
  const [invoices, , error] = useLoad('/invoices');
  const [pos] = useLoad('/purchase-orders');
  useTitle('Home');

  if (error) return <p className="error" role="alert">{error}</p>;
  if (!invoices) return (
    <div role="status" aria-label="Loading your work">
      <span className="skel w40" style={{ height: 28, marginBottom: 12 }} />
      <span className="skel w60" style={{ marginBottom: 28 }} />
      <div className="kpi-strip">{[0, 1, 2, 3].map((i) => <div key={i} className="kpi-card"><span className="skel w60" /><span className="skel w80" style={{ height: 22 }} /><span className="skel w40" /></div>)}</div>
    </div>
  );

  const by = (...st) => invoices.filter((i) => st.includes(i.status));
  const byDue = (a, b) => new Date(a.dueDate) - new Date(b.dueDate);
  const bySubmitted = (a, b) => new Date(a.submittedAt) - new Date(b.submittedAt);
  const toFix = by(...WITH_VENDOR);
  const toReview = by('pending_review').sort(bySubmitted);
  const toPay = by('approved', 'partially_paid').sort(byDue);
  const toApprove = by('pending_approval').sort(bySubmitted);
  const inFlight = [...toReview, ...toApprove];
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const paidThisMonth = invoices.flatMap((i) => i.payments || []).filter((p) => new Date(p.date) >= monthStart).reduce((s, p) => s + p.amount, 0);
  const overdue = invoices.filter(isOverdue).sort(byDue);
  const overdueAmount = overdue.reduce((s, i) => s + balanceOf(i), 0);

  const sum = (list) => list.reduce((s, i) => s + balanceOf(i), 0);
  const weekAhead = invoices.filter((i) => !isOverdue(i) && ['approved', 'partially_paid', 'pending_approval', 'pending_review'].includes(i.status) && daysUntil(i.dueDate) <= 7);
  const oldestWait = inFlight.length ? Math.max(...inFlight.map((i) => daysSince(i.submittedAt))) : 0;
  const myCount = isVendor ? toFix.length
    : (can('finance') ? toReview.length + toPay.length : 0) + (can('manager') ? toApprove.length : 0) + (can('vendor') ? toFix.length : 0);

  // Heads-up: risks worth acting on, most urgent first.
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const poTips = (pos || []).filter((p) => p.status === 'open' && p.invoiced >= p.amount * 0.85).map((p) => ({ tone: 'wait', to: '/purchase-orders',
    text: `${p.poNumber}${isVendor ? '' : ` for ${p.vendor?.name}`} is ${Math.round((p.invoiced / p.amount) * 100)}% billed. ${money(Math.max(poLimit(p.amount) - p.invoiced, 0))} left.` }));
  const tips = isVendor ? [
    ...toFix.map((i) => ({ tone: 'bad', to: `/invoices/${i._id}`, text: `${i.invoiceNumber} is back with you to fix before it can be paid.` })),
    ...poTips,
  ] : [
    ...inFlight.filter((i) => daysUntil(i.dueDate) <= 5).map((i) => ({ tone: 'bad', to: `/invoices/${i._id}`,
      text: `${i.invoiceNumber} is ${dueText(i).toLowerCase()} and still needs ${i.status === 'pending_review' ? 'finance review' : 'approval'}.` })),
    ...toReview.filter((i) => daysSince(i.submittedAt) > 2 && daysUntil(i.dueDate) > 5).map((i) => ({ tone: 'wait', to: `/invoices/${i._id}`,
      text: `${i.invoiceNumber} has waited ${plural(daysSince(i.submittedAt), 'day')} for finance review.` })),
    ...(overdue.length ? [{ tone: 'bad', to: '/invoices?overdue=true',
      text: `${plural(overdue.length, 'invoice')} overdue, ${money(overdueAmount)} in total. The oldest is ${overdue[0].invoiceNumber}.` }] : []),
    ...toApprove.filter((i) => daysSince(i.submittedAt) > 2 && daysUntil(i.dueDate) > 5).map((i) => ({ tone: 'wait', to: `/invoices/${i._id}`,
      text: `${i.invoiceNumber} has waited ${plural(daysSince(i.submittedAt), 'day')} for approval.` })),
    ...poTips,
    ...(weekAhead.length ? [{ tone: 'pay', to: '/invoices?status=approved',
      text: `${money(sum(weekAhead))} falls due in the next 7 days across ${plural(weekAhead.length, 'invoice')}.` }] : []),
  ];

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Today</h1>
          <p className="lede">
            {myCount ? `${myCount} invoice${myCount === 1 ? ' needs' : 's need'} you today.` : 'Nothing is waiting on you right now.'}
            {overdue.length > 0 && ` ${overdue.length} ${overdue.length === 1 ? 'is' : 'are'} overdue.`}
          </p>
        </div>
      </div>

      <div className="kpi-strip">
        <Link to={`/invoices?status=${toReview.length ? 'pending_review' : 'pending_approval'}`} className="kpi-card">
          <span className="kpi-label">In review or approval</span>
          <span className="kpi-value">{money(sum(inFlight))}</span>
          <span className={`kpi-sub${oldestWait > 2 ? ' late' : ''}`}>{toReview.length} with finance, {toApprove.length} with managers</span>
        </Link>
        <Link to="/invoices?overdue=true" className="kpi-card">
          <span className="kpi-label">Overdue</span>
          <span className="kpi-value">{money(overdueAmount)}</span>
          <span className={`kpi-sub${overdue.length ? ' late' : ''}`}>{overdue.length ? `${plural(overdue.length, 'invoice')} past due date` : 'Nothing overdue'}</span>
        </Link>
        <Link to="/invoices?status=approved" className="kpi-card">
          <span className="kpi-label">Due in the next 7 days</span>
          <span className="kpi-value">{money(sum(weekAhead))}</span>
          <span className="kpi-sub">{weekAhead.length} invoice{weekAhead.length === 1 ? '' : 's'} coming up</span>
        </Link>
        <div className="kpi-card">
          <span className="kpi-label">{isVendor ? 'Paid to you this month' : 'Paid this month'}</span>
          <span className="kpi-value">{money(paidThisMonth)}</span>
          <span className="kpi-sub">{isVendor ? 'Received from your customer' : 'Sent to vendors'}</span>
        </div>
      </div>

      <section className="panel route-panel">
        <div className="panel-head">
          <h2>Payment route</h2>
          <p className="muted small">Every invoice moves left to right. Click a stage to see its invoices.</p>
        </div>
        <Route invoices={invoices} />
      </section>

      <div className="dash-grid">
        <div className="panel">
          <div className="panel-head"><h2>Your to-do list</h2></div>
          {myCount === 0 && (
            <div className="all-clear">
              <span className="mark" aria-hidden="true">✓</span>
              <span><b>All clear</b>Nothing needs your action right now. New work will appear here.</span>
            </div>
          )}
          {myCount > 0 && can('manager') && (
            <TaskGroup title="Waiting for your approval" hint="These passed every automatic check. Open one to approve or reject it."
              items={toApprove} action="Review" empty="No invoices are waiting for approval."
              detail={(i) => (daysSince(i.submittedAt) ? `Waiting ${daysSince(i.submittedAt)} day${daysSince(i.submittedAt) === 1 ? '' : 's'}` : 'Entered today')} />
          )}
          {myCount > 0 && can('finance') && (
            <TaskGroup title="Waiting for your review" hint="These passed every automatic check. Look them over, then send each to a manager or back to the vendor."
              items={toReview} action="Review" empty="Nothing is waiting for review."
              detail={(i) => (daysSince(i.submittedAt) ? `Sent ${daysSince(i.submittedAt)} day${daysSince(i.submittedAt) === 1 ? '' : 's'} ago` : 'Sent today')} />
          )}
          {myCount > 0 && can('finance') && (
            <TaskGroup title="Ready to pay" hint="Approved by a manager. The most urgent are first."
              items={toPay} action="Pay" empty="Nothing is waiting for payment." detail={dueText} />
          )}
          {myCount > 0 && can('vendor') && (
            <TaskGroup title="Needs your fix" hint="Correct these and resubmit. The checks run again straight away."
              items={toFix} action="Fix" empty="No invoices need fixing."
              detail={(i) => ({ rejected: 'Rejected by a manager', returned: 'Returned by finance' }[i.status] || 'Failed a check')} />
          )}
        </div>

        <div className="side-stack">
          <div className="panel tight">
            <h2>Heads-up</h2>
            <p className="muted small">What will turn into a late payment if nobody acts.</p>
            {tips.length === 0 ? <p className="empty-line">Nothing to flag. Approvals and payments are on track.</p> : (
              <ul className="tips">
                {tips.slice(0, 6).map((t) => <li key={t.text} className={t.tone}><Link to={t.to}>{t.text}</Link></li>)}
              </ul>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
