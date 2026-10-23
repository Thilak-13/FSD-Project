import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import api, { useLoad, errMsg } from '../api';
import { useToast } from '../components/Toast';
import PageHeader from '../components/PageHeader';
import { CHECK_TITLES, FIX_TIPS } from './InvoiceDetail';
import { money } from '../format';
import useTitle from '../useTitle';
import { useAuth } from '../auth';
import { verify, lineTotals, GST_RATES, poLimit, PO_TOLERANCE_TEXT } from '../../../server/services/verify.js';

const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');
const localDay = (n) => `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
const today = localDay(new Date());
const BLANK = { invoiceNumber: '', vendor: '', purchaseOrder: '', invoiceDate: today, dueDate: '', notes: '' };
const newLine = () => ({ key: Math.random(), description: '', quantity: 1, rate: '', gstRate: 18 });
// Statuses the server ignores for duplicates and PO totals.
const DEAD = ['verification_failed', 'rejected'];
// Stop the mouse wheel from quietly changing amounts in number fields.
const noWheel = (e) => e.currentTarget.blur();

export default function InvoiceForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { isVendor } = useAuth();
  const [vendors] = useLoad('/vendors');
  const [form, setForm] = useState(BLANK);
  const [lines, setLines] = useState(() => [newLine()]);
  const [file, setFile] = useState(null);
  const [fileKey, setFileKey] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [loaded, setLoaded] = useState(!id);
  const [tried, setTried] = useState(false);
  useTitle(id ? 'Fix invoice' : 'New invoice');
  const [pos] = useLoad(`/purchase-orders?vendor=${form.vendor}`);
  const [vendorInvoices] = useLoad(`/invoices?vendor=${form.vendor}`);
  const vendor = vendors?.find((v) => v._id === form.vendor);
  const po = pos?.find((p) => p._id === form.purchaseOrder);

  useEffect(() => {
    if (id) api.get(`/invoices/${id}`).then(({ data: i }) => {
      setForm({
        invoiceNumber: i.invoiceNumber, vendor: i.vendor._id, purchaseOrder: i.purchaseOrder?._id || '',
        invoiceDate: day(i.invoiceDate), dueDate: day(i.dueDate), notes: i.notes || '',
      });
      // Invoices entered before line items existed become one line for their total.
      setLines(i.lines?.length ? i.lines.map((l) => ({ ...l, key: Math.random() })) : [{ ...newLine(), description: 'As per bill', rate: i.amount, gstRate: 0 }]);
    }, (e) => setError(errMsg(e))).finally(() => setLoaded(true));
  }, [id]);

  // Warn before closing the tab with unsent changes.
  useEffect(() => {
    if (!dirty || busy) return undefined;
    const warn = (e) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, busy]);

  const edit = (patch) => { setForm((f) => ({ ...f, ...patch })); setDirty(true); };
  const set = (k) => (e) => edit({ [k]: e.target.value });
  const [numbering, setNumbering] = useState(false);
  const generateNumber = async () => {
    setNumbering(true);
    try { const { data } = await api.get(`/invoices/next-number?vendor=${form.vendor}`); edit({ invoiceNumber: data.invoiceNumber }); }
    catch (e) { toast(errMsg(e), 'bad'); }
    setNumbering(false);
  };
  const setLine = (key, k) => (e) => { setLines((ls) => ls.map((l) => (l.key === key ? { ...l, [k]: e.target.value } : l))); setDirty(true); };

  // Preselect the vendor when opened from a vendor's page (/invoices/new?vendor=<id>).
  const [params] = useSearchParams();
  const preset = params.get('vendor');
  const dueFromTerms = (v, invoiceDate) => (v && invoiceDate ? day(new Date(+new Date(invoiceDate) + v.paymentTermsDays * 86400000)) : '');
  useEffect(() => {
    const v = !id && (isVendor ? vendors?.[0] : preset && vendors?.find((x) => x._id === preset));
    if (v) setForm((f) => (f.vendor ? f : { ...f, vendor: v._id, dueDate: dueFromTerms(v, f.invoiceDate) }));
  }, [id, preset, vendors, isVendor]);
  const pickVendor = (e) => {
    const v = vendors.find((x) => x._id === e.target.value);
    edit({ vendor: e.target.value, purchaseOrder: '', dueDate: dueFromTerms(v, form.invoiceDate) || form.dueDate });
  };

  const totals = lineTotals(lines.map((l) => ({ quantity: Number(l.quantity) || 0, rate: Number(l.rate) || 0, gstRate: Number(l.gstRate) })));
  const amount = totals.total;

  // Same rules the server runs, fed with what the form already knows.
  const live = useMemo(() => {
    const others = (vendorInvoices || []).filter((i) => i._id !== id && !DEAD.includes(i.status) && i.vendor?._id === form.vendor);
    const duplicateCount = others.filter((i) => i.invoiceNumber === form.invoiceNumber.trim()).length;
    const poInvoicedTotal = po ? others.filter((i) => i.purchaseOrder?._id === po._id).reduce((s, i) => s + i.amount, 0) : 0;
    const checks = verify({ ...form, amount }, { vendor, duplicateCount, po: po && { ...po, vendor: po.vendor?._id }, poInvoicedTotal });
    const waiting = {
      vendor_active: !form.vendor,
      not_duplicate: !form.vendor || !form.invoiceNumber.trim() || !vendorInvoices,
      amount_positive: lines.every((l) => l.rate === ''),
      due_date_valid: !form.dueDate,
    };
    return { checks: checks.map((c) => ({ ...c, waiting: waiting[c.rule] })), duplicateCount, poInvoicedTotal };
  }, [vendorInvoices, id, form, amount, vendor, po, lines]);
  const poLeft = po && poLimit(po.amount) - live.poInvoicedTotal;

  // Caught here so people see a plain message before the server checks run.
  const badLine = lines.some((l) => !l.description.trim() || !(Number(l.quantity) > 0) || l.rate === '' || Number(l.rate) < 0);
  const problems = {
    lines: badLine ? 'Each line needs a description, a quantity above 0 and a rate.' : !(amount > 0) ? 'The total must be more than ₹0.' : '',
    dueDate: form.dueDate && form.invoiceDate && form.dueDate < form.invoiceDate ? "The due date can't be before the invoice date." : '',
    file: file && !/\.(pdf|png|jpe?g)$/i.test(file.name) ? 'Attach a PDF, PNG or JPEG file.'
      : file && file.size > 5 * 1024 * 1024 ? 'This file is larger than 5 MB. Attach a smaller copy.' : '',
  };
  // A half-typed line isn't an error until the person tries to submit.
  const shown = (k) => problems[k] && (k !== 'lines' || tried);
  const invalid = (k) => (shown(k) ? { 'aria-invalid': true, 'aria-describedby': `${k}-error` } : {});
  const fieldError = (k) => shown(k) && <small className="field-error" id={`${k}-error`}>{problems[k]}</small>;

  const preview = useMemo(() => file && !problems.file && { url: URL.createObjectURL(file), pdf: /\.pdf$/i.test(file.name) }, [file, problems.file]);
  useEffect(() => () => preview && URL.revokeObjectURL(preview.url), [preview]);

  const submit = async (e) => {
    e.preventDefault();
    const another = e.nativeEvent.submitter?.value === 'another';
    const first = Object.keys(problems).find((k) => problems[k]);
    if (first) { setTried(true); (document.querySelector(`[aria-describedby="${first}-error"]`) || document.querySelector('.line input'))?.focus(); return; }
    setBusy(true); setError('');
    const body = new FormData();
    Object.entries(form).forEach(([k, v]) => body.append(k, v));
    body.append('lines', JSON.stringify(lines.map(({ description, quantity, rate, gstRate }) => ({ description, quantity, rate, gstRate }))));
    if (file) body.append('attachment', file);
    try {
      const { data } = await (id ? api.put(`/invoices/${id}`, body) : api.post('/invoices', body));
      const failed = data.checks.filter((c) => !c.passed).length;
      const verb = id ? 'Resubmitted' : 'Submitted';
      toast(failed ? `${verb} ${data.invoiceNumber}, but ${failed} check${failed === 1 ? '' : 's'} failed.${another ? ' Open it from Invoices to fix it.' : ' See what to fix below.'}` : `${verb} ${data.invoiceNumber}. All checks passed and finance has been asked to review it.`, failed ? 'bad' : 'ok');
      setDirty(false);
      if (!another) return navigate(`/invoices/${data._id}`);
      // Keep the vendor and dates for the next bill from the same vendor.
      setForm((f) => ({ ...BLANK, vendor: f.vendor, invoiceDate: f.invoiceDate, dueDate: f.dueDate }));
      setLines([newLine()]); setFile(null); setFileKey((k) => k + 1); setTried(false); setBusy(false);
      document.querySelector('#invoice-number')?.focus();
    } catch (err) { setError(errMsg(err)); setBusy(false); }
  };

  return (
    <>
      <Link to={id ? `/invoices/${id}` : '/invoices'} className="back">{id ? 'Back to invoice' : 'All invoices'}</Link>
      <PageHeader title={id ? 'Fix and resubmit invoice' : 'New invoice'}>
        {id ? 'Correct the details below. All checks run again when you resubmit.'
          : isVendor ? 'Enter your bill. The checks on the right update as you type, so you can fix problems before sending it.'
          : 'Enter the details from the vendor\'s bill. The checks on the right update as you type.'}
      </PageHeader>

      {!loaded ? <div className="loading" role="status">Loading invoice…</div> : (
      <div className="form-layout">
        <form className="panel" onSubmit={submit}>
          {isVendor ? (
            <p className="form-vendor"><span>Billing as</span><b>{vendor?.name || 'Loading…'}</b>
              {vendor && <small>{vendor.gstin ? `GSTIN ${vendor.gstin}. ` : ''}{vendor.paymentTermsDays}-day payment terms.</small>}</p>
          ) : (
          <label>Vendor
            <select value={form.vendor} onChange={pickVendor} required>
              <option value="">{vendors ? 'Choose a vendor' : 'Loading vendors…'}</option>
              {vendors?.map((v) => <option key={v._id} value={v._id}>{v.name}{v.active ? '' : ' (inactive)'}</option>)}
            </select>
            {vendor && <small className="hint">{vendor.gstin ? `GSTIN ${vendor.gstin}. ` : ''}Payment terms: {vendor.paymentTermsDays} days{vendor.active ? '' : '. This vendor is inactive, so the invoice will fail its checks.'}</small>}
          </label>
          )}
          <div className="two">
            <label>Invoice number
              <span className="with-btn">
              <input id="invoice-number" value={form.invoiceNumber} onChange={set('invoiceNumber')} placeholder={isVendor ? 'Your bill number' : 'As printed on the bill'} required
                aria-invalid={live.duplicateCount > 0 || undefined} aria-describedby={live.duplicateCount ? 'dup-warning' : undefined} />
              <button type="button" className="btn" onClick={generateNumber} disabled={!form.vendor || numbering}>{numbering ? 'Wait…' : 'Generate'}</button>
              </span>
              {live.duplicateCount > 0 && <small className="field-error" id="dup-warning">This vendor already has an invoice with this number.</small>}
            </label>
            <label>Purchase order this bill is for
              <select value={form.purchaseOrder} onChange={set('purchaseOrder')} disabled={!form.vendor}>
                <option value="">{form.vendor ? 'Not against an order' : 'Choose a vendor first'}</option>
                {pos?.filter((p) => p.vendor?._id === form.vendor && (p.status === 'open' || p._id === form.purchaseOrder)).map((p) => (
                  <option key={p._id} value={p._id}>{p.poNumber}{p.description ? `, ${p.description}` : ''} ({money(Math.max(poLimit(p.amount) - p.invoiced, 0))} left){p.status === 'open' ? '' : ', closed'}</option>
                ))}
              </select>
              {!po && form.vendor && <small className="hint">The order {isVendor ? 'your customer' : 'we'} placed for these goods or services. Picking it lets the checks confirm the bill stays within what was agreed.</small>}
              {po && <small className={amount > poLeft ? 'field-error' : 'hint'}>{money(live.poInvoicedTotal)} billed so far. Up to {money(Math.max(poLeft, 0))} left, including the {PO_TOLERANCE_TEXT} allowance.</small>}
            </label>
          </div>
          <div className="two">
            <label>Invoice date<input type="date" value={form.invoiceDate} onChange={(e) => edit({ invoiceDate: e.target.value, dueDate: dueFromTerms(vendor, e.target.value) || form.dueDate })} required /></label>
            <label>Due date<input type="date" value={form.dueDate} onChange={set('dueDate')} required {...invalid('dueDate')} />{fieldError('dueDate')}
              {vendor && !problems.dueDate && <small className="hint">Filled in from the vendor's terms</small>}
            </label>
          </div>

          <fieldset className="lines">
            <legend>What was billed</legend>
            <div className="line-head" aria-hidden="true"><span>Description</span><span>Qty</span><span>Rate (₹)</span><span>GST</span><span>Amount</span><span /></div>
            {lines.map((l, i) => {
              const sub = (Number(l.quantity) || 0) * (Number(l.rate) || 0);
              return (
                <div className="line" key={l.key}>
                  <input aria-label={`Line ${i + 1} description`} value={l.description} onChange={setLine(l.key, 'description')} placeholder="Item or service" {...(i === 0 ? invalid('lines') : {})} />
                  <input aria-label={`Line ${i + 1} quantity`} type="number" min="0" step="any" value={l.quantity} onChange={setLine(l.key, 'quantity')} onWheel={noWheel} />
                  <input aria-label={`Line ${i + 1} rate`} type="number" min="0" step="0.01" value={l.rate} onChange={setLine(l.key, 'rate')} onWheel={noWheel} />
                  <select aria-label={`Line ${i + 1} GST rate`} value={l.gstRate} onChange={setLine(l.key, 'gstRate')}>
                    {GST_RATES.map((g) => <option key={g} value={g}>{g}%</option>)}
                  </select>
                  <span className="line-amt">{money(sub * (1 + Number(l.gstRate) / 100))}</span>
                  <button type="button" className="icon-x" aria-label={`Remove line ${i + 1}`} disabled={lines.length === 1}
                    onClick={() => { setLines((ls) => ls.filter((x) => x.key !== l.key)); setDirty(true); }}>×</button>
                </div>
              );
            })}
            {fieldError('lines')}
            <button type="button" className="btn small" onClick={() => setLines((ls) => [...ls, newLine()])}>Add line</button>
            <dl className="line-totals">
              <div><dt>Before tax</dt><dd>{money(totals.taxable)}</dd></div>
              <div><dt>GST</dt><dd>{money(totals.gst)}</dd></div>
              <div className="total"><dt>Invoice total</dt><dd>{money(amount)}</dd></div>
            </dl>
          </fieldset>

          <label>Notes for the approver (optional)
            <textarea rows="2" value={form.notes} onChange={set('notes')} maxLength={1000} placeholder="What this bill is for, cost centre, anything unusual" />
          </label>
          <label>Copy of the bill (optional)
            <input key={fileKey} type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={(e) => { setFile(e.target.files[0]); setDirty(true); }} {...invalid('file')} />
            {fieldError('file') || <small className="hint">PDF, PNG or JPEG, up to 5 MB. It shows on the right so you can copy from it.</small>}
          </label>
          {tried && Object.values(problems).some(Boolean) && <p className="error" role="alert">Fix the highlighted {Object.values(problems).filter(Boolean).length > 1 ? 'fields' : 'field'} before submitting.</p>}
          {error && <p className="error" role="alert">{error}</p>}
          <div className="form-actions">
            <button className="btn primary" disabled={busy}>{busy ? 'Checking…' : id ? 'Resubmit for checks' : 'Submit for checks'}</button>
            {!id && <button className="btn" value="another" disabled={busy}>Submit and add another</button>}
          </div>
        </form>

        <div className="form-side">
          <section className="panel">
            <h2>Checks</h2>
            <p className="muted small">The same checks run when you submit. Passing all of them sends the invoice to finance for review, then to a manager to approve.</p>
            <ul className="rule-list" aria-live="polite">
              {live.checks.map((c) => (
                <li key={c.rule} className={c.waiting ? 'wait' : c.passed ? 'pass' : 'fail'}>
                  <span className="rule-dot" aria-hidden="true" />
                  <span><b>{CHECK_TITLES[c.rule]}</b>{!c.waiting && !c.passed && <><small>{c.message}</small><small className="fix-tip">{FIX_TIPS[c.rule]}</small></>}</span>
                  <span className="rule-pill">{c.waiting ? 'Waiting' : c.passed ? 'Passes' : 'Will fail'}</span>
                </li>
              ))}
              {!form.purchaseOrder && <li className="wait"><span className="rule-dot" aria-hidden="true" /><span><b>{CHECK_TITLES.po_match}</b><small>Only checked when a purchase order is linked.</small></span><span className="rule-pill">Skipped</span></li>}
            </ul>
          </section>
          {preview && (
            <section className="panel bill-peek" aria-label="Attached bill">
              {preview.pdf ? <iframe src={preview.url} title="Attached bill" /> : <img src={preview.url} alt="Attached bill" />}
            </section>
          )}
        </div>
      </div>
      )}
    </>
  );
}
