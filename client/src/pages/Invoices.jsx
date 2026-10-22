import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api, { useLoad, errMsg } from '../api';
import { useAuth } from '../auth';
import { useToast } from '../components/Toast';
import PageHeader from '../components/PageHeader';
import StatusBadge from '../components/StatusBadge';
import { money, dueText, balanceOf, isOverdue, STATUS } from '../format';
import useTitle from '../useTitle';

const TABS = [
  { key: '', label: 'All' },
  { key: 'fix', label: STATUS.verification_failed.label },
  { key: 'pending_approval', label: STATUS.pending_approval.label },
  { key: 'approved', label: STATUS.approved.label },
  { key: 'partially_paid', label: STATUS.partially_paid.label },
  { key: 'paid', label: STATUS.paid.label },
  { key: 'rejected', label: STATUS.rejected.label },
  { key: 'overdue', label: 'Overdue' },
];

export default function Invoices() {
  const { can } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [all, reload, error] = useLoad('/invoices');
  useTitle('Invoices');
  const [vendors] = useLoad('/vendors');
  const tab = params.get('overdue') === 'true' ? 'overdue' : params.get('status') || '';
  const vendor = params.get('vendor') || '';

  const setTab = (key) => {
    const p = new URLSearchParams();
    if (key === 'overdue') p.set('overdue', 'true'); else if (key) p.set('status', key);
    if (vendor) p.set('vendor', vendor);
    setParams(p);
    setSelected(new Set());
  };
  const setVendor = (v) => { const p = new URLSearchParams(params); v ? p.set('vendor', v) : p.delete('vendor'); setParams(p); };

  const inTab = (i, key) => (key === 'overdue' ? isOverdue(i)
    : key === 'fix' ? ['verification_failed', 'rejected'].includes(i.status)
    : !key || i.status === key);
  const q = search.trim().toLowerCase();
  const list = (all || []).filter((i) => inTab(i, tab) && (!vendor || i.vendor?._id === vendor)
    && (!q || i.invoiceNumber.toLowerCase().includes(q) || i.vendor?.name.toLowerCase().includes(q)));

  // Managers can tick invoices that are waiting for approval and approve them together.
  const canBatch = can('manager');
  const approvable = list.filter((i) => i.status === 'pending_approval');
  const picked = (all || []).filter((i) => selected.has(i._id) && i.status === 'pending_approval');
  const toggle = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allPicked = approvable.length > 0 && approvable.every((i) => selected.has(i._id));
  const toggleAll = () => setSelected(allPicked ? new Set() : new Set(approvable.map((i) => i._id)));

  const approve = async (invoices) => {
    setBusy(true);
    const results = await Promise.allSettled(invoices.map((i) => api.post(`/invoices/${i._id}/approve`, { note: '' })));
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.map((r, n) => r.status === 'rejected' && `${invoices[n].invoiceNumber}: ${errMsg(r.reason)}`).filter(Boolean);
    if (ok) toast(`${ok} invoice${ok === 1 ? '' : 's'} approved. Finance has been notified to pay.`);
    if (failed.length) toast(`Not approved: ${failed.join('; ')}`, 'bad');
    setSelected(new Set());
    setBusy(false);
    reload();
  };

  return (
    <>
      <PageHeader title="Invoices">
        Every vendor invoice and where it is in the approval and payment process.
      </PageHeader>

      <div className="tabs" role="group" aria-label="Filter by stage">
        {TABS.map((t) => (
          <button key={t.key} aria-pressed={tab === t.key} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>
            {t.label}<span className="tab-count">{(all || []).filter((i) => inTab(i, t.key)).length}</span>
          </button>
        ))}
      </div>

      <div className="toolbar">
        <input type="search" placeholder="Search by invoice number or vendor" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search invoices" />
        <select aria-label="Vendor" value={vendor} onChange={(e) => setVendor(e.target.value)}>
          <option value="">All vendors</option>
          {vendors?.map((v) => <option key={v._id} value={v._id}>{v.name}</option>)}
        </select>
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      {all && <p className="result-count" role="status">Showing {list.length} of {all.length} invoice{all.length === 1 ? '' : 's'}</p>}
      <div className="table-wrap">
        <table className="rows inv-table">
          <caption className="sr-only">Invoices. Open an invoice number to see its details.</caption>
          <thead>
            <tr>
              {canBatch && (
                <th className="check">
                  <input type="checkbox" checked={allPicked} onChange={toggleAll} disabled={!approvable.length} aria-label="Select all invoices waiting for approval" />
                </th>
              )}
              <th>Invoice</th><th>Vendor</th><th className="num">Amount</th><th className="num c-bal">Still to pay</th><th>Due</th><th>Status</th>
              <th><span className="sr-only">Action</span></th>
            </tr>
          </thead>
          <tbody>
            {!all && !error && [0, 1, 2, 3, 4].map((n) => (
              <tr key={n} className="skel-row" aria-hidden="true">
                {canBatch && <td className="check" />}
                <td><span className="skel w80" /></td><td><span className="skel w80" /></td><td><span className="skel w60" /></td><td><span className="skel w60" /></td>
                <td><span className="skel w60" /></td><td><span className="skel w60" /></td><td />
              </tr>
            ))}
            {list.map((i) => {
              const open = () => navigate(`/invoices/${i._id}`);
              return (
                <tr key={i._id} onClick={open} className={selected.has(i._id) ? 'selected' : ''}>
                  {canBatch && (
                    <td className="check" onClick={(e) => e.stopPropagation()}>
                      {i.status === 'pending_approval' && (
                        <input type="checkbox" checked={selected.has(i._id)} onChange={() => toggle(i._id)} aria-label={`Select ${i.invoiceNumber}`} />
                      )}
                    </td>
                  )}
                  <td className="c-inv"><Link to={`/invoices/${i._id}`} onClick={(e) => e.stopPropagation()} className="inv-no">{i.invoiceNumber}</Link></td>
                  <td className="c-vendor">
                    <span className="cell-vendor">{i.vendor?.name}{i.vendor?.gstin && <small>GSTIN {i.vendor.gstin}</small>}</span>
                  </td>
                  <td className="num c-amt">{money(i.amount)}</td>
                  <td className="num c-bal">{['paid', 'rejected', 'verification_failed'].includes(i.status) ? '—' : money(balanceOf(i))}</td>
                  <td className={`c-due ${isOverdue(i) ? 'late' : ''}`}>{dueText(i)}</td>
                  <td className="c-status"><StatusBadge invoice={i} /></td>
                  <td className="c-act num" onClick={(e) => e.stopPropagation()}>
                    {can('manager') && i.status === 'pending_approval' && (
                      <button className="btn primary xs" disabled={busy} onClick={() => approve([i])} aria-label={`Approve ${i.invoiceNumber}`}>Approve</button>
                    )}
                    {can('finance') && ['approved', 'partially_paid'].includes(i.status) && (
                      <Link className="btn primary xs" to={`/invoices/${i._id}`} aria-label={`Pay ${i.invoiceNumber}`}>Pay</Link>
                    )}
                    {can('finance') && ['verification_failed', 'rejected'].includes(i.status) && (
                      <Link className="btn xs" to={`/invoices/${i._id}/edit`} aria-label={`Fix ${i.invoiceNumber}`}>Fix</Link>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {all && list.length === 0 && (
          <div className="empty">
            <b>No invoices here.</b>
            <span>{q || vendor ? 'Try clearing the search or vendor filter.' : 'Invoices will appear in this list when they reach this stage.'}</span>
          </div>
        )}
      </div>

      {picked.length > 0 && (
        <div className="batch-bar" role="region" aria-label="Selected invoices">
          <span><b>{picked.length} selected</b>, total <span className="mono">{money(picked.reduce((s, i) => s + i.amount, 0))}</span></span>
          <div className="btn-row">
            <button className="btn ghost" onClick={() => setSelected(new Set())}>Clear</button>
            <button className="btn primary" disabled={busy} onClick={() => approve(picked)}>{busy ? 'Approving…' : `Approve ${picked.length} invoice${picked.length === 1 ? '' : 's'}`}</button>
          </div>
        </div>
      )}
    </>
  );
}
