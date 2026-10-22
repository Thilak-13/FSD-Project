import { useState } from 'react';
import api, { useLoad, errMsg } from '../api';
import { useAuth } from '../auth';
import { useToast } from '../components/Toast';
import PageHeader from '../components/PageHeader';
import { money } from '../format';
import useTitle from '../useTitle';

const blank = { poNumber: '', vendor: '', amount: '' };

export default function PurchaseOrders() {
  const { can } = useAuth();
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
    try { await api.post('/purchase-orders', form); toast(`PO ${form.poNumber} created`); setForm(blank); setAdding(false); setError(''); reload(); }
    catch (err) { setError(errMsg(err)); }
  };
  const toggle = async (po) => {
    try { await api.put(`/purchase-orders/${po._id}`, { status: po.status === 'open' ? 'closed' : 'open' }); toast(`PO ${po.poNumber} ${po.status === 'open' ? 'closed. New invoices can no longer be linked to it.' : 'reopened'}`); reload(); }
    catch (err) { toast(errMsg(err), 'bad'); }
  };

  return (
    <>
      <PageHeader title="Purchase orders" actions={can('finance') && !adding && <button className="btn primary" onClick={() => setAdding(true)}>Create PO</button>}>
        What you agreed to buy. Invoices linked to a PO can't go more than 2% over its amount.
      </PageHeader>
      {adding && (
        <form className="panel add-form" onSubmit={add}>
          <h2>New purchase order</h2>
          <div className="fields">
            <label>PO number<input value={form.poNumber} onChange={set('poNumber')} placeholder="PO-1004" required autoFocus /></label>
            <label>Vendor<select value={form.vendor} onChange={set('vendor')} required>
              <option value="">Choose a vendor</option>
              {vendors?.filter((v) => v.active).map((v) => <option key={v._id} value={v._id}>{v.name}</option>)}
            </select></label>
            <label>Amount (₹)<input type="number" min="0" step="0.01" value={form.amount} onChange={set('amount')} required /></label>
          </div>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="btn-row"><button className="btn primary">Create PO</button><button type="button" className="btn ghost" onClick={() => setAdding(false)}>Cancel</button></div>
        </form>
      )}
      <div className="table-wrap">
        <table>
          <thead><tr><th>PO number</th><th>Vendor</th><th className="num">Amount</th><th>Status</th>{can('finance') && <th><span className="sr-only">Actions</span></th>}</tr></thead>
          <tbody>
            {list?.map((po) => (
              <tr key={po._id}>
                <td><b>{po.poNumber}</b></td><td>{po.vendor?.name}</td><td className="num">{money(po.amount)}</td>
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
