import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api, { useLoad, errMsg } from '../api';
import { useAuth } from '../auth';
import { useToast } from '../components/Toast';
import StatusBadge from '../components/StatusBadge';
import { money, dueText, balanceOf, paidOf, isOverdue } from '../format';
import './vendor.css';
import useTitle from '../useTitle';

// Statuses that don't count toward a PO's used amount (same rule as the server's verification).
const DEAD = ['verification_failed', 'rejected'];

function EditForm({ vendor, onDone }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: vendor.name, email: vendor.email || '', gstin: vendor.gstin || '', paymentTermsDays: vendor.paymentTermsDays });
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    try { await api.put(`/vendors/${vendor._id}`, form); toast('Vendor details saved'); onDone(true); }
    catch (err) { setError(errMsg(err)); }
  };

  return (
    <form onSubmit={save}>
      <div className="vendor-fields">
        <label>Name<input value={form.name} onChange={set('name')} required autoFocus /></label>
        <label>Billing email<input type="email" value={form.email} onChange={set('email')} /></label>
        <label>GSTIN<input value={form.gstin} onChange={set('gstin')} maxLength="15" /></label>
        <label>Payment terms (days)<input type="number" min="0" value={form.paymentTermsDays} onChange={set('paymentTermsDays')} required /></label>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="btn-row"><button className="btn primary">Save changes</button><button type="button" className="btn ghost" onClick={() => onDone(false)}>Cancel</button></div>
    </form>
  );
}

export default function VendorDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [vendors, reloadVendors, error] = useLoad('/vendors');
  const [invoices] = useLoad(`/invoices?vendor=${id}`);
  const [pos] = useLoad(`/purchase-orders?vendor=${id}`);
  const [editing, setEditing] = useState(false);
  useTitle(vendors?.find((x) => x._id === id)?.name || 'Vendor');

  if (error) return <p className="error" role="alert">{error}</p>;
  if (!vendors || !invoices || !pos) return <div className="loading" role="status">Loading vendor…</div>;
  const v = vendors.find((x) => x._id === id);
  if (!v) return <div className="empty"><b>Vendor not found.</b><Link to="/vendors">Back to vendors</Link></div>;

  const live = invoices.filter((i) => !DEAD.includes(i.status));
  const open = live.filter((i) => i.status !== 'paid');
  const invoiced = live.reduce((s, i) => s + i.amount, 0);
  const paid = live.reduce((s, i) => s + paidOf(i), 0);
  const owed = open.reduce((s, i) => s + balanceOf(i), 0);
  const overdue = invoices.filter(isOverdue).reduce((s, i) => s + balanceOf(i), 0);
  const usedOn = (po) => live.filter((i) => i.purchaseOrder?._id === po._id).reduce((s, i) => s + i.amount, 0);

  const toggle = async () => {
    try {
      await api.put(`/vendors/${v._id}`, { active: !v.active });
      toast(v.active ? `${v.name} deactivated. New invoices from them will fail their checks.` : `${v.name} activated`);
      reloadVendors();
    } catch (err) { toast(errMsg(err), 'bad'); }
  };

  return (
    <>
      <Link to="/vendors" className="back">All vendors</Link>
      <div className="page-header">
        <div>
          <h1>{v.name} <span className={`badge ${v.active ? 'ok' : 'neutral'}`}>{v.active ? 'Active' : 'Inactive'}</span></h1>
          <p className="lede">{v.paymentTermsDays}-day payment terms. {v.active ? 'Invoices from this vendor can be entered and paid.' : 'Invoices from this vendor are blocked until it is activated again.'}</p>
        </div>
        {can('finance') && (
          <div className="page-actions">
            <button className="btn" onClick={toggle}>{v.active ? 'Deactivate' : 'Activate'}</button>
            {v.active && can('vendor') && <button className="btn primary" onClick={() => navigate(`/invoices/new?vendor=${v._id}`)}>New invoice for this vendor</button>}
          </div>
        )}
      </div>

      <div className="stat-row">
        <div className="stat-card"><span>Invoiced</span><b>{money(invoiced)}</b><small>{live.length} invoice{live.length === 1 ? '' : 's'}</small></div>
        <div className="stat-card ok"><span>Paid</span><b>{money(paid)}</b></div>
        <div className="stat-card"><span>Still owed</span><b>{money(owed)}</b><small>{open.length} open invoice{open.length === 1 ? '' : 's'}</small></div>
        <div className={`stat-card ${overdue ? 'warn' : ''}`}><span>Overdue</span><b>{money(overdue)}</b></div>
      </div>

      <div className="vendor-grid">
        <section className="panel">
          <div className="vendor-head">
            <h2>Details</h2>
            {can('finance') && !editing && <button className="link-btn" onClick={() => setEditing(true)}>Edit</button>}
          </div>
          {editing ? <EditForm vendor={v} onDone={(saved) => { setEditing(false); if (saved) reloadVendors(); }} /> : (
            <dl className="facts">
              <dt>Billing email</dt><dd>{v.email || '—'}</dd>
              <dt>GSTIN</dt><dd>{v.gstin || '—'}</dd>
              <dt>Payment terms</dt><dd>{v.paymentTermsDays} days</dd>
            </dl>
          )}
        </section>

        <section className="panel">
          <h2>Purchase orders</h2>
          <p className="muted small">How much of each PO has been invoiced so far.</p>
          {pos.length === 0 ? <p className="empty-line">No purchase orders for this vendor.</p> : (
            <ul className="po-list">
              {pos.map((po) => {
                const used = usedOn(po);
                const pct = Math.min(100, Math.round((used / po.amount) * 100));
                return (
                  <li key={po._id}>
                    <div className="paybar-head">
                      <span><b>{po.poNumber}</b> <span className={`badge ${po.status === 'open' ? 'pay' : 'neutral'}`}>{po.status === 'open' ? 'Open' : 'Closed'}</span></span>
                      <span>{money(used)} of {money(po.amount)}</span>
                    </div>
                    <div className="paybar-track" role="progressbar" aria-label={`${po.poNumber} used`} aria-valuenow={pct} aria-valuemin="0" aria-valuemax="100">
                      <div className={used > po.amount ? 'over' : ''} style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <section className="panel">
        <h2>Invoices</h2>
        {invoices.length === 0 ? <p className="empty-line">No invoices from this vendor yet.</p> : (
          <div className="table-wrap flat">
            <table className="rows">
              <thead><tr><th>Invoice</th><th className="num">Amount</th><th className="num">Still to pay</th><th>Due</th><th>Status</th></tr></thead>
              <tbody>
                {invoices.map((i) => (
                  <tr key={i._id} onClick={() => navigate(`/invoices/${i._id}`)}>
                    <td><Link to={`/invoices/${i._id}`} onClick={(e) => e.stopPropagation()}><b>{i.invoiceNumber}</b></Link></td>
                    <td className="num">{money(i.amount)}</td>
                    <td className="num">{['paid', ...DEAD].includes(i.status) ? '—' : money(balanceOf(i))}</td>
                    <td className={isOverdue(i) ? 'late' : ''}>{dueText(i)}</td>
                    <td><StatusBadge invoice={i} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
