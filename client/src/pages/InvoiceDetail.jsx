import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api, { useLoad, errMsg, download } from '../api';
import { useAuth } from '../auth';
import { useToast } from '../components/Toast';
import Journey from '../components/Journey';
import StatusBadge from '../components/StatusBadge';
import { money, date, paidOf, balanceOf, dueText, isOverdue } from '../format';
import './invoice-detail.css';
import useTitle from '../useTitle';

export const CHECK_TITLES = {
  vendor_active: 'Vendor is registered and active',
  not_duplicate: 'Not a duplicate of an earlier invoice',
  amount_positive: 'Amount is valid',
  due_date_valid: 'Due date is after the invoice date',
  po_match: 'Matches the purchase order (2% tolerance)',
};

function historyText(h) {
  if (h.action.startsWith('payment ')) return `Payment of ${money(Number(h.action.slice(8)))} recorded`;
  return {
    submitted: 'Invoice entered', verified: 'Passed all automatic checks, sent for approval',
    verification_failed: 'Failed automatic checks', resubmitted: 'Corrected and resubmitted',
    approved: 'Approved', rejected: 'Rejected',
  }[h.action] || h.action;
}

function NextStep({ inv, reload }) {
  const { can, user } = useAuth();
  const toast = useToast();
  const [note, setNote] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const balance = balanceOf(inv);
  const [pay, setPay] = useState({ amount: balance, method: 'NEFT', reference: '', date: new Date().toISOString().slice(0, 10) });
  useEffect(() => setPay((p) => ({ ...p, amount: balance })), [balance]);

  const run = async (fn, msg) => {
    setBusy(true); setError('');
    try { await fn(); toast(msg); setNote(''); setRejecting(false); await reload(); } catch (e) { setError(errMsg(e)); }
    setBusy(false);
  };
  const lastRejection = [...inv.history].reverse().find((h) => h.action === 'rejected');
  const s = inv.status;

  let title, body, action = null;
  if (s === 'verification_failed') {
    title = 'Fix the failed checks';
    body = can('finance') ? 'The checks below show what is wrong. Correct the invoice and resubmit it; the checks run again automatically.' : 'Finance needs to correct this invoice before it can be approved.';
    if (can('finance')) action = <Link className="btn primary" to={`/invoices/${inv._id}/edit`}>Fix and resubmit</Link>;
  } else if (s === 'rejected') {
    title = 'Rejected by a manager';
    body = <>Reason: <q>{lastRejection?.note}</q> {can('finance') && 'Correct the invoice and resubmit it if it should still be paid.'}</>;
    if (can('finance')) action = <Link className="btn" to={`/invoices/${inv._id}/edit`}>Correct and resubmit</Link>;
  } else if (s === 'pending_approval' && can('manager') && [...inv.history].reverse().find((h) => ['submitted', 'resubmitted'].includes(h.action))?.by?._id === user.id) {
    title = 'Waiting for another approver';
    body = 'You entered this invoice, so a different manager must approve or reject it. This keeps entering and approving separate.';
  } else if (s === 'pending_approval') {
    title = can('manager') ? 'Your decision is needed' : 'Waiting for a manager to approve';
    body = can('manager') ? 'Every automatic check passed. Approve to send it to finance for payment, or reject it with a reason.' : 'Managers have been notified. You will get an alert when they decide.';
    if (can('manager')) action = rejecting ? (
      <form className="inline-form" onSubmit={(e) => { e.preventDefault(); run(() => api.post(`/invoices/${inv._id}/reject`, { note }), 'Invoice rejected. Finance has been notified.'); }}>
        <label>Why are you rejecting it?<textarea value={note} onChange={(e) => setNote(e.target.value)} required autoFocus placeholder="For example: quantity does not match the delivery note" /></label>
        <div className="btn-row">
          <button className="btn danger" disabled={busy}>Reject invoice</button>
          <button type="button" className="btn ghost" onClick={() => setRejecting(false)}>Cancel</button>
        </div>
      </form>
    ) : (
      <div className="btn-row">
        <button className="btn approve" disabled={busy} onClick={() => run(() => api.post(`/invoices/${inv._id}/approve`, { note: '' }), 'Invoice approved. Finance has been notified to pay it.')}>Approve</button>
        <button className="btn ghost danger-text" onClick={() => setRejecting(true)}>Reject…</button>
      </div>
    );
  } else if (s === 'approved' || s === 'partially_paid') {
    title = can('finance') ? 'Record the payment' : 'Waiting for finance to pay';
    body = can('finance')
      ? `${money(balance)} is still to pay, ${dueText(inv).toLowerCase()}. Pay it in full or record a part-payment.`
      : `${money(balance)} is still to pay, ${dueText(inv).toLowerCase()}.`;
    if (can('finance')) action = (
      <form className="pay-form" onSubmit={(e) => {
        e.preventDefault();
        const full = Number(pay.amount) === balance;
        run(() => api.post(`/invoices/${inv._id}/payments`, pay), full ? `Payment of ${money(Number(pay.amount))} recorded. The invoice is fully paid.` : `Part-payment of ${money(Number(pay.amount))} recorded.`);
      }}>
        <label>Amount<input type="number" step="0.01" min="0.01" max={balance} value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} required /></label>
        <label>Paid on<input type="date" value={pay.date} onChange={(e) => setPay({ ...pay, date: e.target.value })} required /></label>
        <label>Method<select value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>
          {['NEFT', 'RTGS', 'UPI', 'Cheque'].map((m) => <option key={m}>{m}</option>)}
        </select></label>
        <label>Reference (UTR or cheque no.)<input value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} /></label>
        <button className="btn primary" disabled={busy}>Record payment</button>
      </form>
    );
  } else if (s === 'paid') {
    title = 'Fully paid';
    body = `Paid in full on ${date(inv.paidAt)}. Nothing else to do.`;
  }

  return (
    <section className={`panel next-step ${s}`}>
      <h2>Next step: {title}</h2>
      <p>{body}</p>
      {error && <p className="error" role="alert">{error}</p>}
      {action}
    </section>
  );
}

// The vendor's bill, shown inline so an approver can compare it with the checks.
function BillPane({ id, name, has }) {
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!has) return;
    let url;
    api.get(`/invoices/${id}/attachment?inline=1`, { responseType: 'blob' }).then(
      ({ data }) => { url = URL.createObjectURL(data); setFile({ url, type: data.type }); },
      () => setError('The bill could not be loaded. Try downloading it instead.'),
    );
    return () => url && URL.revokeObjectURL(url);
  }, [id, has]);

  return (
    <section className="verify-doc bill-preview" aria-label="Vendor's bill">
      <div className="doc-bar">
        <b>{has ? name : "Vendor's bill"}</b>
        {has && <button className="link-btn" onClick={() => download(`/invoices/${id}/attachment`, name)}>Download</button>}
      </div>
      {!has && (
        <div className="doc-empty">
          <b>No bill attached</b>
          <span>Finance can attach the PDF when fixing or entering an invoice, so approvers can compare it with the details.</span>
        </div>
      )}
      {error && <p className="error" style={{ margin: '1rem' }}>{error}</p>}
      {has && !file && !error && <div className="doc-empty" role="status"><span className="skel w60" /><span className="skel w80" /><span className="skel w40" /></div>}
      {file && (file.type.startsWith('image/')
        ? <img src={file.url} alt={`Bill ${name}`} />
        : <iframe src={`${file.url}#toolbar=0&navpanes=0`} title={`Bill ${name}`} />)}
    </section>
  );
}

export default function InvoiceDetail() {
  const { id } = useParams();
  const [inv, reload, loadError] = useLoad(`/invoices/${id}`);
  useTitle(inv ? `Invoice ${inv.invoiceNumber}` : 'Invoice');
  if (loadError) return <p className="error" role="alert">{loadError}</p>;
  if (!inv) return (
    <div role="status" aria-label="Loading invoice">
      <span className="skel w40" style={{ height: 28, marginBottom: 14 }} />
      <span className="skel w60" style={{ marginBottom: 24 }} />
      <div className="panel"><span className="skel w80" style={{ height: 40 }} /></div>
    </div>
  );
  const paid = paidOf(inv);
  const balance = balanceOf(inv);
  const flagged = inv.checks.filter((c) => !c.passed).length;

  return (
    <>
      <Link to="/invoices" className="back">All invoices</Link>
      <p className="print-only voucher-head">Payment voucher, printed {date(new Date())}</p>
      <div className="page-header">
        <div>
          <span className="tag">Invoice verification</span>
          <h1><span className="mono">{inv.invoiceNumber}</span> <StatusBadge invoice={inv} /></h1>
          <p className="lede">{money(inv.amount)} from {inv.vendor?.name}. <span className={isOverdue(inv) ? 'late' : ''}>{dueText(inv)}.</span></p>
        </div>
        <div className="page-actions"><button className="btn" onClick={() => window.print()}>Print / Save as PDF</button></div>
      </div>

      <section className="panel"><Journey invoice={inv} /></section>

      <NextStep inv={inv} reload={reload} />

      <div className="verify">
        <BillPane id={id} name={inv.attachmentName} has={!!inv.attachment} />

        <div className="verify-side">
          <section className="panel">
            <span className="tag">Invoice details</span>
            <h2>What the vendor billed</h2>
            <dl className="meta-grid">
              <div><dt>Invoice number</dt><dd className="mono">{inv.invoiceNumber}</dd></div>
              <div><dt>Vendor</dt><dd>{inv.vendor?.name}</dd></div>
              <div><dt>Vendor GSTIN</dt><dd className="mono">{inv.vendor?.gstin || '—'}</dd></div>
              <div><dt>Purchase order</dt><dd className="mono">{inv.purchaseOrder ? `${inv.purchaseOrder.poNumber} (${money(inv.purchaseOrder.amount)})` : 'None linked'}</dd></div>
              <div><dt>Invoice date</dt><dd>{date(inv.invoiceDate)}</dd></div>
              <div><dt>Due date</dt><dd className={isOverdue(inv) ? 'late' : ''}>{date(inv.dueDate)}</dd></div>
            </dl>
            {inv.lines?.length > 0 && (
              <table className="compact" style={{ marginTop: '1rem' }}>
                <thead><tr><th>Item</th><th className="num">Qty</th><th className="num">Rate</th><th className="num">GST</th><th className="num">Amount</th></tr></thead>
                <tbody>
                  {inv.lines.map((l, i) => (
                    <tr key={i}><td>{l.description}</td><td className="num">{l.quantity}</td><td className="num">{money(l.rate)}</td><td className="num">{l.gstRate}%</td><td className="num">{money(l.quantity * l.rate * (1 + l.gstRate / 100))}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
            {inv.notes && <p className="small" style={{ marginTop: '1rem' }}><b>Note from finance:</b> {inv.notes}</p>}
          </section>

          <section className="panel">
            <span className="tag">Rule engine</span>
            <h2>{flagged ? `${flagged} of ${inv.checks.length} checks flagged` : `All ${inv.checks.length} checks passed`}</h2>
            <p className="muted small">Run automatically when the invoice was entered.</p>
            <ul className="rule-list">
              {inv.checks.map((c) => (
                <li key={c.rule} className={c.passed ? 'pass' : 'fail'}>
                  <span className="rule-dot" aria-hidden="true" />
                  <span><b>{CHECK_TITLES[c.rule] || c.rule}</b>{(!c.passed || c.rule === 'po_match') && <small>{c.message}</small>}</span>
                  <span className="rule-pill">{c.passed ? 'Passed' : 'Flagged'}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="panel">
            <span className="tag">Payment</span>
            <h2>{balance > 0 && !['verification_failed', 'rejected'].includes(inv.status) ? 'Still to pay' : inv.status === 'paid' ? 'Paid in full' : 'Not payable yet'}</h2>
            <div className="sum-well">
              <div><span>Invoice amount</span><span>{money(inv.amount)}</span></div>
              <div><span>Paid so far ({inv.payments.length} payment{inv.payments.length === 1 ? '' : 's'})</span><span>− {money(paid)}</span></div>
              <div className="total"><span>Balance payable</span><span>{money(balance)}</span></div>
            </div>
            {inv.payments.length > 0 && (
              <table className="compact" style={{ marginTop: '1rem' }}>
                <thead><tr><th>Date</th><th>Method</th><th>Reference</th><th className="num">Amount</th></tr></thead>
                <tbody>{inv.payments.map((p) => (
                  <tr key={p._id}><td>{date(p.date)}</td><td>{p.method}</td><td className="mono">{p.reference || '—'}</td><td className="num">{money(p.amount)}</td></tr>
                ))}</tbody>
              </table>
            )}
          </section>

          <section className="panel">
            <span className="tag">Audit trail</span>
            <h2>Activity</h2>
            <ol className="activity">
              {[...inv.history].reverse().map((h, i) => (
                <li key={i}>
                  <b>{historyText(h)}</b>
                  <small>{h.by?.name ?? 'System'}{h.by?.role ? ` (${h.by.role})` : ''}, {date(h.at)}</small>
                  {h.note && <q>{h.note}</q>}
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </>
  );
}
