import { useState } from 'react';
import { Link } from 'react-router-dom';
import api, { useLoad, errMsg } from '../api';
import { useAuth } from '../auth';
import { useToast } from '../components/Toast';
import PageHeader from '../components/PageHeader';
import { money } from '../format';
import { poLimit, PO_TOLERANCE_TEXT } from '../../../server/services/verify.js';
import useTitle from '../useTitle';

const blank = { poNumber: '', vendor: '', description: '', purpose: '', requestedBy: '', neededBy: '', amount: '' };

export default function PurchaseOrders() {
  const { can, isVendor } = useAuth();
  const toast = useToast();
  const [list, reload] = useLoad('/purchase-orders');
  const [vendors] = useLoad('/vendors');
  const [form, setForm] = useState(blank);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  useTitle('Purchase orders');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const add = async (e) => {
    e.preventDefault();
    try { const { data } = await api.post('/purchase-orders', form); toast(`${data.poNumber} created. The vendor can now bill against it.`); setForm(blank); setAdding(false); setError(''); reload(); }
    catch (err) { setError(errMsg(err)); }
  };
  const toggle = async (po) => {
    try { await api.put(`/purchase-orders/${po._id}`, { status: po.status === 'open' ? 'closed' : 'open' }); toast(`PO ${po.poNumber} ${po.status === 'open' ? 'closed. New invoices can no longer be linked to it.' : 'reopened'}`); reload(); }
    catch (err) { toast(errMsg(err), 'bad'); }
  };

  return (
    <>
      <PageHeader title={isVendor ? 'Your purchase orders' : 'Purchase orders'} actions={can('finance') && !adding && <button className="btn primary" onClick={() => setAdding(true)}>Create PO</button>}>
        {isVendor
          ? `Orders your customer has placed with you. Pick one when you send a bill for it; together, your bills can go up to ${PO_TOLERANCE_TEXT} over the order amount.`
          : `Orders placed with vendors before they bill. A vendor picks the order their bill is for, and the checks stop bills that go more than ${PO_TOLERANCE_TEXT} over what was agreed.`}
      </PageHeader>
      {adding && (
        <form className="panel add-form" onSubmit={add}>
          <h2>New purchase order</h2>
          <div className="fields">
            <label>PO number<input value={form.poNumber} onChange={set('poNumber')} placeholder="Leave blank for the next number" autoFocus /></label>
            <label>Vendor<select value={form.vendor} onChange={set('vendor')} required>
              <option value="">Choose a vendor</option>
              {vendors?.filter((v) => v.active).map((v) => <option key={v._id} value={v._id}>{v.name}</option>)}
            </select></label>
            <label>What is being bought<input value={form.description} onChange={set('description')} placeholder="For example: 40 office chairs" required /></label>
            <label>Amount (₹)<input type="number" min="0" step="0.01" value={form.amount} onChange={set('amount')} required /></label>
            <label className="span-2">Why it is needed<input value={form.purpose} onChange={set('purpose')} placeholder="For example: second-floor fit-out for the new sales team" required /></label>
            <label>Requested by<input value={form.requestedBy} onChange={set('requestedBy')} placeholder="Team or person" required /></label>
            <label>Needed by<input type="date" value={form.neededBy} onChange={set('neededBy')} /></label>
          </div>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="btn-row"><button className="btn primary">Create PO</button><button type="button" className="btn ghost" onClick={() => setAdding(false)}>Cancel</button></div>
        </form>
      )}
      <div className="table-wrap">
        <table>
          <thead><tr><th>PO number</th>{!isVendor && <th>Vendor</th>}<th className="num">Amount</th><th>Billed so far</th><th>Status</th>{can('finance') && <th><span className="sr-only">Actions</span></th>}</tr></thead>
          <tbody>
            {list?.map((po) => (
              <tr key={po._id}>
                <td><Link to={`/purchase-orders/${po._id}`} className="inv-no">{po.poNumber}</Link>
                  <small className="cell-sub">{po.description || 'No description recorded'}{po.requestedBy ? `, for ${po.requestedBy}` : ''}</small></td>{!isVendor && <td>{po.vendor?.name}</td>}<td className="num">{money(po.amount)}</td>
                <td className="po-use">
                  <span className="po-use-text">{money(po.invoiced)}<small>{po.status === 'open' ? `${money(Math.max(poLimit(po.amount) - po.invoiced, 0))} left` : 'closed'}</small></span>
                  <span className="po-bar" aria-hidden="true"><i className={po.invoiced > po.amount ? 'over' : po.invoiced >= po.amount * 0.85 ? 'near' : ''} style={{ width: `${Math.min((po.invoiced / po.amount) * 100, 100)}%` }} /></span>
                </td>
                <td><span className={`badge ${po.status === 'open' ? 'pay' : 'neutral'}`}>{po.status === 'open' ? 'Open' : 'Closed'}</span></td>
                {can('finance') && <td className="num"><button className="link-btn" onClick={() => toggle(po)} aria-label={`${po.status === 'open' ? 'Close' : 'Reopen'} ${po.poNumber}`}>{po.status === 'open' ? 'Close' : 'Reopen'}</button></td>}
              </tr>
            ))}
          </tbody>
        </table>
        {!list && <div className="loading" role="status">Loading purchase orders…</div>}
        {list?.length === 0 && <div className="empty"><b>No purchase orders yet.</b><span>Create one so invoices can be matched against what was agreed.</span></div>}
      </div>
    </>
  );
}
