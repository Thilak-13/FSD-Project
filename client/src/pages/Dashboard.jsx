import { useState } from 'react';
import { Link } from 'react-router-dom';
import api, { useLoad, errMsg } from '../api';
import { useAuth } from '../auth';
import { useToast } from '../components/Toast';
import Route from '../components/Route';
import { money, dueText, balanceOf, isOverdue, daysSince, daysUntil } from '../format';
import useTitle from '../useTitle';

const Svg = ({ d }) => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

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
  const { user, can } = useAuth();
  const toast = useToast();
  const [invoices, reload, error] = useLoad('/invoices');
  const [k, reloadK] = useLoad('/reports/kpis');
  const [running, setRunning] = useState(false);
  useTitle('Home');

  if (error) return <p className="error" role="alert">{error}</p>;
  if (!invoices || !k) return (
    <div role="status" aria-label="Loading your work">
      <span className="skel w40" style={{ height: 28, marginBottom: 12 }} />
      <span className="skel w60" style={{ marginBottom: 28 }} />
      <div className="kpi-strip">{[0, 1, 2, 3].map((i) => <div key={i} className="kpi-card"><span className="skel w60" /><span className="skel w80" style={{ height: 22 }} /><span className="skel w40" /></div>)}</div>
    </div>
  );

  const by = (...st) => invoices.filter((i) => st.includes(i.status));
  const byDue = (a, b) => new Date(a.dueDate) - new Date(b.dueDate);
  const toFix = by('verification_failed', 'rejected');
  const toPay = by('approved', 'partially_paid').sort(byDue);
  const toApprove = by('pending_approval').sort((a, b) => new Date(a.submittedAt) - new Date(b.submittedAt));
  const overdue = invoices.filter(isOverdue).sort(byDue);
  const overdueAmount = overdue.reduce((s, i) => s + balanceOf(i), 0);

  const sum = (list) => list.reduce((s, i) => s + balanceOf(i), 0);
  const weekAhead = invoices.filter((i) => !isOverdue(i) && ['approved', 'partially_paid', 'pending_approval'].includes(i.status) && daysUntil(i.dueDate) <= 7);
  const oldestWait = toApprove[0] ? daysSince(toApprove[0].submittedAt) : 0;
  const myCount = (can('finance') ? toFix.length + toPay.length : 0) + (can('manager') ? toApprove.length : 0);

  const runReminders = async () => {
    setRunning(true);
    try {
      const { data } = await api.post('/reminders/run');
      toast(data.sent ? `Reminder check done: ${data.sent} reminder${data.sent === 1 ? '' : 's'} sent` : 'Reminder check done: nothing new to remind about today');
      reload(); reloadK();
    } catch (e) { toast(errMsg(e), 'bad'); }
    setRunning(false);
  };

  return (
    <>
      <div className="page-header">
        <div>
          <span className="tag">Overview</span>
          <h1>{greeting()}, {user.name.split(' ')[0]}</h1>
          <p className="lede">
            {myCount ? `${myCount} invoice${myCount === 1 ? ' needs' : 's need'} you today.` : 'Nothing is waiting on you right now.'}
            {overdue.length > 0 && ` ${overdue.length} ${overdue.length === 1 ? 'is' : 'are'} overdue.`}
          </p>
        </div>
        <div className="page-actions">
          {can() && <button className="btn" onClick={runReminders} disabled={running}>{running ? 'Checking…' : 'Run reminder check now'}</button>}
        </div>
      </div>

      <div className="kpi-strip">
        <Link to="/invoices?status=pending_approval" className="kpi-card">
          <span className="kpi-top"><span className="kpi-label">Waiting for approval</span><span className="kpi-icon wait"><Svg d="M12 6v6l4 2M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z" /></span></span>
          <span className="kpi-value">{money(sum(toApprove))}</span>
          <span className={`badge ${oldestWait > 2 ? 'bad' : 'wait'}`}>{toApprove.length} invoice{toApprove.length === 1 ? '' : 's'}{toApprove.length ? `, oldest ${oldestWait} day${oldestWait === 1 ? '' : 's'}` : ''}</span>
        </Link>
        <Link to="/invoices?overdue=true" className="kpi-card">
          <span className="kpi-top"><span className="kpi-label">Overdue</span><span className="kpi-icon bad"><Svg d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></span></span>
          <span className="kpi-value">{money(overdueAmount)}</span>
          <span className={`badge ${k.overdue ? 'bad' : 'ok'}`}>{k.overdue ? `${k.overdue} past due date` : 'Nothing overdue'}</span>
        </Link>
        <Link to="/invoices?status=approved" className="kpi-card">
          <span className="kpi-top"><span className="kpi-label">Due in 7 days</span><span className="kpi-icon"><Svg d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" /></span></span>
          <span className="kpi-value">{money(sum(weekAhead))}</span>
          <span className="badge pay">{weekAhead.length} invoice{weekAhead.length === 1 ? '' : 's'} coming up</span>
        </Link>
        <div className="kpi-card">
          <span className="kpi-top"><span className="kpi-label">Paid this month</span><span className="kpi-icon ok"><Svg d="M20 6 9 17l-5-5" /></span></span>
          <span className="kpi-value">{money(k.paidThisMonth)}</span>
          <span className="badge ok">Sent to vendors</span>
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
          <div className="panel-head"><span className="tag">Action needed</span><h2>Your to-do list</h2></div>
          {myCount === 0 && (
            <div className="all-clear">
              <span className="mark" aria-hidden="true">✓</span>
              <span><b>All clear</b>Nothing needs your action right now. New work will appear here.</span>
            </div>
          )}
          {myCount > 0 && can('manager') && (
            <TaskGroup title="Waiting for your approval" hint="These passed every automatic check. Open one to approve or reject it."
              items={toApprove} action="Review" empty="No invoices are waiting for approval."
              detail={(i) => `Waiting ${daysSince(i.submittedAt)} day${daysSince(i.submittedAt) === 1 ? '' : 's'}`} />
          )}
          {myCount > 0 && can('finance') && (
            <TaskGroup title="Ready to pay" hint="Approved by a manager. The most urgent are first."
              items={toPay} action="Pay" empty="Nothing is waiting for payment." detail={dueText} />
          )}
          {myCount > 0 && can('finance') && (
            <TaskGroup title="Needs fixing" hint="Failed a check or was rejected. Correct and resubmit."
              items={toFix} action="Fix" empty="No invoices need fixing."
              detail={(i) => (i.status === 'rejected' ? 'Rejected by manager' : 'Failed a check')} />
          )}
        </div>

        <div className="side-stack">
          {overdue.length > 0 && (
            <div className="panel tight">
              <h2>Most overdue</h2>
              <ul className="mini-list">
                {overdue.slice(0, 4).map((i) => (
                  <li key={i._id}><Link to={`/invoices/${i._id}`}>{i.invoiceNumber}</Link><span className="late">{dueText(i)}</span></li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
