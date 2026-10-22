import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import api, { useLoad, errMsg } from '../api';
import { useToast } from '../components/Toast';
import PageHeader from '../components/PageHeader';
import { CHECK_TITLES } from './InvoiceDetail';
import { money } from '../format';
import useTitle from '../useTitle';

const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');
const localDay = (n) => `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
const today = localDay(new Date());

export default function InvoiceForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [vendors] = useLoad('/vendors');
  const [form, setForm] = useState({ invoiceNumber: '', vendor: '', purchaseOrder: '', amount: '', invoiceDate: today, dueDate: '' });
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(!id);
  const [tried, setTried] = useState(false);
  useTitle(id ? 'Fix invoice' : 'New invoice');
  const [pos] = useLoad(`/purchase-orders?vendor=${form.vendor}`);
  const vendor = vendors?.find((v) => v._id === form.vendor);
  const po = pos?.find((p) => p._id === form.purchaseOrder);

  useEffect(() => {
    if (id) api.get(`/invoices/${id}`).then(({ data: i }) => setForm({
      invoiceNumber: i.invoiceNumber, vendor: i.vendor._id, purchaseOrder: i.purchaseOrder?._id || '',
      amount: i.amount, invoiceDate: day(i.invoiceDate), dueDate: day(i.dueDate),
    }), (e) => setError(errMsg(e))).finally(() => setLoaded(true));
  }, [id]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // Preselect the vendor when opened from a vendor's page (/invoices/new?vendor=<id>).
  const [params] = useSearchParams();
  const preset = params.get('vendor');
  const dueFromTerms = (v, invoiceDate) => (v && invoiceDate ? day(new Date(+new Date(invoiceDate) + v.paymentTermsDays * 86400000)) : '');
  useEffect(() => {
    const v = !id && preset && vendors?.find((x) => x._id === preset);
    if (v) setForm((f) => (f.vendor ? f : { ...f, vendor: v._id, dueDate: dueFromTerms(v, f.invoiceDate) }));
  }, [id, preset, vendors]);
  const pickVendor = (e) => {
    const v = vendors.find((x) => x._id === e.target.value);
    setForm({ ...form, vendor: e.target.value, purchaseOrder: '', dueDate: dueFromTerms(v, form.invoiceDate) || form.dueDate });
  };

  // Caught here so people see a plain message before the server checks run.
  const problems = {
    amount: form.amount !== '' && !(Number(form.amount) > 0) ? 'Enter an amount greater than ₹0.' : '',
    dueDate: form.dueDate && form.invoiceDate && form.dueDate < form.invoiceDate ? "The due date can't be before the invoice date." : '',
    file: file && !/\.(pdf|png|jpe?g)$/i.test(file.name) ? 'Attach a PDF, PNG or JPEG file.'
      : file && file.size > 5 * 1024 * 1024 ? 'This file is larger than 5 MB. Attach a smaller copy.' : '',
  };
  const invalid = (k) => (problems[k] ? { 'aria-invalid': true, 'aria-describedby': `${k}-error` } : {});
  const fieldError = (k) => problems[k] && <small className="field-error" id={`${k}-error`}>{problems[k]}</small>;

  const submit = async (e) => {
    e.preventDefault();
    const first = Object.keys(problems).find((k) => problems[k]);
    if (first) { setTried(true); document.querySelector(`[aria-describedby="${first}-error"]`)?.focus(); return; }
    setBusy(true); setError('');
    const body = new FormData();
    Object.entries(form).forEach(([k, v]) => body.append(k, v));
    if (file) body.append('attachment', file);
    try {
      const { data } = await (id ? api.put(`/invoices/${id}`, body) : api.post('/invoices', body));
      const failed = data.checks.filter((c) => !c.passed).length;
      toast(failed ? `${id ? 'Resubmitted' : 'Submitted'}, but ${failed} check${failed === 1 ? '' : 's'} failed. See what to fix below.` : `${id ? 'Resubmitted' : 'Submitted'}. All checks passed and managers have been asked to approve it.`, failed ? 'bad' : 'ok');
      navigate(`/invoices/${data._id}`);
    } catch (err) { setError(errMsg(err)); setBusy(false); }
  };

  return (
    <>
      <Link to={id ? `/invoices/${id}` : '/invoices'} className="back">{id ? 'Back to invoice' : 'All invoices'}</Link>
      <PageHeader title={id ? 'Fix and resubmit invoice' : 'New invoice'}>
        {id ? 'Correct the details below. All checks run again when you resubmit.' : 'Enter the details from the vendor\'s bill. The system checks it as soon as you submit.'}
      </PageHeader>

      {!loaded ? <div className="loading" role="status">Loading invoice…</div> : (
      <div className="form-layout">
        <form className="panel" onSubmit={submit}>
          <label>Vendor
            <select value={form.vendor} onChange={pickVendor} required>
              <option value="">{vendors ? 'Choose a vendor' : 'Loading vendors…'}</option>
              {vendors?.map((v) => <option key={v._id} value={v._id}>{v.name}{v.active ? '' : ' (inactive)'}</option>)}
            </select>
            {vendor && <small className="hint">Payment terms: {vendor.paymentTermsDays} days{vendor.active ? '' : '. This vendor is inactive, so the invoice will fail its checks.'}</small>}
          </label>
          <div className="two">
            <label>Invoice number<input value={form.invoiceNumber} onChange={set('invoiceNumber')} placeholder="As printed on the bill" required /></label>
            <label>Amount (₹)<input type="number" step="0.01" value={form.amount} onChange={set('amount')} required {...invalid('amount')} />{fieldError('amount')}</label>
          </div>
          <label>Purchase order
            <select value={form.purchaseOrder} onChange={set('purchaseOrder')} disabled={!form.vendor}>
              <option value="">{form.vendor ? 'No purchase order' : 'Choose a vendor first'}</option>
              {pos?.filter((p) => p.vendor?._id === form.vendor && (p.status === 'open' || p._id === form.purchaseOrder)).map((p) => <option key={p._id} value={p._id}>{p.poNumber}, {money(p.amount)}{p.status === 'open' ? '' : ' (closed)'}</option>)}
            </select>
            {po && <small className="hint">The invoice total on this PO may not exceed {money(po.amount * 1.02)} (PO amount + 2%).</small>}
          </label>
          <div className="two">
            <label>Invoice date<input type="date" value={form.invoiceDate} onChange={(e) => setForm({ ...form, invoiceDate: e.target.value, dueDate: dueFromTerms(vendor, e.target.value) || form.dueDate })} required /></label>
            <label>Due date<input type="date" value={form.dueDate} onChange={set('dueDate')} required {...invalid('dueDate')} />{fieldError('dueDate')}
              {vendor && !problems.dueDate && <small className="hint">Filled in from the vendor's terms</small>}
            </label>
          </div>
          <label>Copy of the bill (optional)
            <input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={(e) => setFile(e.target.files[0])} {...invalid('file')} />
            {fieldError('file') || <small className="hint">PDF, PNG or JPEG, up to 5 MB</small>}
          </label>
          {tried && Object.values(problems).some(Boolean) && <p className="error" role="alert">Fix the highlighted {Object.values(problems).filter(Boolean).length > 1 ? 'fields' : 'field'} before submitting.</p>}
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn primary wide" disabled={busy}>{busy ? 'Checking…' : id ? 'Resubmit for checks' : 'Submit for checks'}</button>
        </form>

        <div className="panel explain">
          <h2>What happens when you submit</h2>
          <ol className="explain-steps">
            <li>
              <b>The system runs these checks</b>
              <ul className="check-preview">
                {Object.entries(CHECK_TITLES).map(([rule, t]) => <li key={rule}>{t}{rule === 'po_match' && ' (only if a PO is linked)'}</li>)}
              </ul>
            </li>
            <li><b>If everything passes,</b> managers get an alert to approve it.</li>
            <li><b>If something fails,</b> it comes back to you with the reason, ready to fix.</li>
          </ol>
        </div>
      </div>
      )}
    </>
  );
}
