import { useState } from 'react';
import { Link } from 'react-router-dom';
import api, { useLoad, errMsg } from '../api';
import { useAuth } from '../auth';
import { useToast } from '../components/Toast';
import PageHeader from '../components/PageHeader';
import useTitle from '../useTitle';

const blank = { name: '', email: '', gstin: '', paymentTermsDays: 30 };

export default function Vendors() {
  const { can } = useAuth();
  const toast = useToast();
  const [list, reload] = useLoad('/vendors');
  useTitle('Vendors');
  const [form, setForm] = useState(blank);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const add = async (e) => {
    e.preventDefault();
    try { await api.post('/vendors', form); toast(`${form.name} added`); setForm(blank); setAdding(false); setError(''); reload(); }
    catch (err) { setError(errMsg(err)); }
  };
  const toggle = async (v) => {
    try { await api.put(`/vendors/${v._id}`, { active: !v.active }); toast(`${v.name} ${v.active ? 'deactivated. New invoices from them will fail their checks.' : 'activated'}`); reload(); }
    catch (err) { toast(errMsg(err), 'bad'); }
  };

  return (
    <>
      <PageHeader title="Vendors" actions={can('finance') && !adding && <button className="btn primary" onClick={() => setAdding(true)}>Add vendor</button>}>
        Suppliers you pay. Invoices from inactive vendors are blocked automatically.
      </PageHeader>
      {adding && (
        <form className="panel add-form" onSubmit={add}>
          <h2>New vendor</h2>
          <div className="fields">
            <label>Name<input value={form.name} onChange={set('name')} required autoFocus /></label>
            <label>Billing email<input type="email" value={form.email} onChange={set('email')} /></label>
            <label>GSTIN<input value={form.gstin} onChange={set('gstin')} placeholder="15 characters" maxLength="15" /></label>
            <label>Payment terms (days)<input type="number" min="0" value={form.paymentTermsDays} onChange={set('paymentTermsDays')} /></label>
          </div>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="btn-row"><button className="btn primary">Save vendor</button><button type="button" className="btn ghost" onClick={() => setAdding(false)}>Cancel</button></div>
        </form>
      )}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Vendor</th><th>Billing email</th><th>GSTIN</th><th>Payment terms</th><th>Status</th>{can('finance') && <th><span className="sr-only">Actions</span></th>}</tr></thead>
          <tbody>
            {list?.map((v) => (
              <tr key={v._id}>
                <td><Link to={`/vendors/${v._id}`}><b>{v.name}</b></Link></td><td>{v.email || '—'}</td><td>{v.gstin || '—'}</td><td>{v.paymentTermsDays} days</td>
                <td><span className={`badge ${v.active ? 'ok' : 'neutral'}`}>{v.active ? 'Active' : 'Inactive'}</span></td>
                {can('finance') && <td className="num"><button className="link-btn" onClick={() => toggle(v)} aria-label={`${v.active ? 'Deactivate' : 'Activate'} ${v.name}`}>{v.active ? 'Deactivate' : 'Activate'}</button></td>}
              </tr>
            ))}
          </tbody>
        </table>
        {!list && <div className="loading" role="status">Loading vendors…</div>}
      </div>
    </>
  );
}
