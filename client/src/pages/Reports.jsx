import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';
import { useLoad, download, errMsg } from '../api';
import { useToast } from '../components/Toast';
import PageHeader from '../components/PageHeader';
import { money, STATUS } from '../format';
import './reports.css';
import useTitle from '../useTitle';

const fmtK = (v) => (v >= 100000 ? `${v / 100000}L` : `${v / 1000}k`);
const days = (n) => (n == null ? '—' : `${n.toFixed(1)} days`);
const AGING_COLORS = { 'Not yet due': '#8a94a6', '0-30': '#d9a13b', '31-60': '#d97a2b', '61-90': '#c4501f', '90+': '#a3271d' };
const ORDER = ['verification_failed', 'rejected', 'pending_approval', 'approved', 'partially_paid', 'paid'];
const monthName = (ym) => new Date(`${ym}-01`).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });

export default function Reports() {
  const toast = useToast();
  const [range, setRange] = useState({ from: '', to: '' });
  const qs = new URLSearchParams(Object.entries(range).filter(([, v]) => v)).toString();
  const [s, , error] = useLoad(`/reports/summary?${qs}`);
  useTitle('Reports');

  const onTimePct = s?.onTime.paid ? Math.round((s.onTime.onTime / s.onTime.paid) * 100) : null;
  const exportCsv = () => download(`/reports/invoices.csv?${qs}`, 'invoices.csv').then(() => toast('Invoice list downloaded as CSV'), (e) => toast(errMsg(e), 'bad'));

  return (
    <>
      <PageHeader title="Reports" actions={<button className="btn" onClick={exportCsv}>Download CSV</button>}>
        How much you owe, how late it is, and how quickly invoices get approved and paid.
      </PageHeader>
      <div className="toolbar">
        <label className="inline">Invoice date from <input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></label>
        <label className="inline">to <input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></label>
        {(range.from || range.to) && <button className="link-btn" onClick={() => setRange({ from: '', to: '' })}>Clear dates</button>}
      </div>
      {error && <p className="error">{error}</p>}
      {s && (
        <>
          <div className="stat-row">
            <div className="stat-card ok"><span>Paid to vendors</span><b>{money(s.totals.paid)}</b></div>
            <div className="stat-card warn"><span>Still owed</span><b>{money(s.totals.outstanding)}</b></div>
            <div className="stat-card"><span>Average time to approve</span><b>{days(s.cycle.toApproval)}</b></div>
            <div className="stat-card"><span>Average time to pay after approval</span><b>{days(s.cycle.toPayment)}</b></div>
            <div className={`stat-card ${onTimePct == null ? '' : onTimePct >= 80 ? 'ok' : 'warn'}`}>
              <span>Paid on time</span><b>{onTimePct == null ? '—' : `${onTimePct}%`}</b>
              <small>{s.onTime.onTime} of {s.onTime.paid} paid invoices settled by their due date</small>
            </div>
          </div>
          <div className="report-grid">
            <section className="panel">
              <h2>What we owe each vendor</h2>
              <p className="muted small">Unpaid balances on approved and waiting invoices. Vendors with the most overdue come first.</p>
              {s.owedByVendor.length === 0 ? <p className="muted">Nothing owed in this period.</p> : (
                <table className="compact owed">
                  <thead><tr><th>Vendor</th><th className="num hide-sm">Not yet due</th><th className="num">Overdue</th><th className="num">Total</th></tr></thead>
                  <tbody>{s.owedByVendor.map((v) => (
                    <tr key={v._id}>
                      <td><b>{v.name}</b><span className="split" aria-hidden="true">
                        <span className="split-late" style={{ flex: v.overdue }} /><span className="split-due" style={{ flex: v.notDue }} />
                      </span></td>
                      <td className="num hide-sm">{money(v.notDue)}</td>
                      <td className={`num ${v.overdue ? 'late' : 'muted'}`}>{money(v.overdue)}</td>
                      <td className="num"><b>{money(v.notDue + v.overdue)}</b></td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
            </section>
            <section className="panel">
              <h2>Waiting for approval</h2>
              <p className="muted small">Where approvals are stuck, longest wait first. Over 2 days triggers a reminder to managers.</p>
              {s.awaitingApproval.length === 0 ? <p className="muted">No invoices are waiting for approval.</p> : (
                <table className="compact">
                  <thead><tr><th>Invoice</th><th className="hide-sm">Vendor</th><th className="num">Amount</th><th className="num">Waiting</th></tr></thead>
                  <tbody>{s.awaitingApproval.map((i) => (
                    <tr key={i._id}>
                      <td><Link to={`/invoices/${i._id}`}><b>{i.invoiceNumber}</b></Link></td>
                      <td className="hide-sm">{i.vendor}</td>
                      <td className="num">{money(i.amount)}</td>
                      <td className={`num ${i.waitingDays > 2 ? 'late' : ''}`}>{days(i.waitingDays)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
            </section>
          </div>
          <div className="report-grid">
            <section className="panel">
              <h2>How late is what we owe?</h2>
              <p className="muted small">Unpaid amounts grouped by days past due date.</p>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={s.aging}><CartesianGrid vertical={false} stroke="#e3e7ee" /><XAxis dataKey="bucket" tickLine={false} /><YAxis tickFormatter={fmtK} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(v) => money(v)} cursor={{ fill: '#f1f3f7' }} />
                  <Bar dataKey="amount" name="Owed" radius={[4, 4, 0, 0]}>{s.aging.map((a) => <Cell key={a.bucket} fill={AGING_COLORS[a.bucket]} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            </section>
            <section className="panel">
              <h2>Payments each month</h2>
              <p className="muted small">Total paid to vendors per month.</p>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={s.monthly.map((m) => ({ ...m, month: monthName(m._id) }))}><CartesianGrid vertical={false} stroke="#e3e7ee" /><XAxis dataKey="month" tickLine={false} /><YAxis tickFormatter={fmtK} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(v) => money(v)} /><Line dataKey="paid" name="Paid" stroke="#2453d6" strokeWidth={2.5} dot={{ r: 4 }} /></LineChart>
              </ResponsiveContainer>
            </section>
            <section className="panel">
              <h2>Invoices by stage</h2>
              <table className="compact">
                <thead><tr><th>Stage</th><th className="num">Invoices</th><th className="num">Total amount</th></tr></thead>
                <tbody>{[...s.byStatus].sort((a, b) => ORDER.indexOf(a._id) - ORDER.indexOf(b._id)).map((r) => <tr key={r._id}><td><span className={`badge ${STATUS[r._id].tone}`}>{STATUS[r._id].label}</span></td><td className="num">{r.count}</td><td className="num">{money(r.amount)}</td></tr>)}</tbody>
              </table>
            </section>
            <section className="panel">
              <h2>Biggest vendors by amount paid</h2>
              {s.topVendors.length === 0 ? <p className="muted">No payments in this period.</p> : (
                <ul className="bars">
                  {s.topVendors.map((v) => (
                    <li key={v._id}>
                      <span className="bar-label"><b>{v.name}</b><span>{money(v.paid)}</span></span>
                      <span className="bar-track"><span style={{ width: `${(v.paid / s.topVendors[0].paid) * 100}%` }} /></span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </>
  );
}
