import { useState } from 'react';
import api, { useLoad, errMsg } from '../api';
import { useAuth } from '../auth';
import { useToast } from '../components/Toast';
import PageHeader from '../components/PageHeader';
import useTitle from '../useTitle';

const blank = { name: '', email: '', password: '', role: 'vendor', vendor: '' };
// The three roles an admin looks after, in the order a bill passes through them.
const ROLES = {
  vendor: { label: 'Vendor', text: 'Sends bills for one vendor and sees only those' },
  finance: { label: 'Finance', text: 'Reviews bills, keeps vendors and orders, pays' },
  manager: { label: 'Manager', text: 'Approves or rejects reviewed bills' },
};

function VendorPick({ vendors, value, onChange }) {
  return (
    <select value={value} onChange={onChange} required aria-label="Vendor">
      <option value="">Choose the vendor they bill for</option>
      {vendors?.map((v) => <option key={v._id} value={v._id}>{v.name}</option>)}
    </select>
  );
}

export default function Users() {
  const { user } = useAuth();
  const toast = useToast();
  const [list, reload, loadError] = useLoad('/users');
  const [vendors] = useLoad('/vendors');
  const [form, setForm] = useState(blank);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null); // { id, role, vendor, password }
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  useTitle('Users');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const setEdit = (k) => (e) => setEditing({ ...editing, [k]: e.target.value });

  const add = async (e) => {
    e.preventDefault();
    try {
      await api.post('/users', form);
      toast(`${form.name} added. They can sign in now as ${ROLES[form.role].label.toLowerCase()}.`);
      setForm(blank); setAdding(false); setError(''); reload();
    } catch (err) { setError(errMsg(err)); }
  };
  const save = async (e, u) => {
    e.preventDefault();
    const body = { role: editing.role, vendor: editing.vendor, ...(editing.password && { password: editing.password }) };
    try {
      await api.patch(`/users/${u._id}`, body);
      toast(editing.password ? `${u.name} updated. Give them the new password.` : `${u.name} updated.`);
      setEditing(null); reload();
    } catch (err) { toast(errMsg(err), 'bad'); }
  };
  const remove = async (u) => {
    if (!confirm(`Remove ${u.name}? They will no longer be able to sign in.`)) return;
    try { await api.delete(`/users/${u._id}`); toast(`${u.name} removed`); reload(); } catch (err) { toast(errMsg(err), 'bad'); }
  };
  const runReminders = async () => {
    setRunning(true);
    try {
      const { data } = await api.post('/reminders/run');
      toast(data.sent ? `Reminder check done: ${data.sent} reminder${data.sent === 1 ? '' : 's'} sent` : 'Reminder check done: nothing new to remind about today');
    } catch (err) { toast(errMsg(err), 'bad'); }
    setRunning(false);
  };

  if (loadError) return <p className="error" role="alert">{loadError}</p>;
  const counts = Object.fromEntries(Object.keys(ROLES).map((r) => [r, list?.filter((u) => u.role === r).length ?? 0]));

  return (
    <>
      <PageHeader title="Users" actions={<>
        <button className="btn" onClick={runReminders} disabled={running}>{running ? 'Checking…' : 'Run reminder check now'}</button>
        {!adding && <button className="btn primary" onClick={() => setAdding(true)}>Add user</button>}
      </>}>
        Who can sign in and what they can do. Reminders also go out every day at 09:00 on their own.
      </PageHeader>

      <div className="kpi-strip">
        {Object.entries(ROLES).map(([r, { label, text }]) => (
          <div key={r} className="kpi-card">
            <span className="kpi-label">{label}</span>
            <span className="kpi-value">{list ? counts[r] : '…'}</span>
            <span className="kpi-sub">{text}</span>
          </div>
        ))}
        <div className="kpi-card">
          <span className="kpi-label">Vendors without a login</span>
          <span className="kpi-value">{list && vendors ? vendors.filter((v) => !list.some((u) => u.vendor?._id === v._id)).length : '…'}</span>
          <span className="kpi-sub">Their bills can't be sent until someone has a login</span>
        </div>
      </div>

      {adding && (
        <form className="panel add-form" onSubmit={add}>
          <h2>New user</h2>
          <div className="fields">
            <label>Name<input value={form.name} onChange={set('name')} required autoFocus /></label>
            <label>Email<input type="email" value={form.email} onChange={set('email')} required /></label>
            <label>Temporary password<input type="password" minLength="8" value={form.password} onChange={set('password')} required /><small className="hint">At least 8 characters</small></label>
            <label>Role<select value={form.role} onChange={set('role')}>
              {Object.entries(ROLES).map(([r, { label }]) => <option key={r} value={r}>{label}</option>)}
            </select><small className="hint">{ROLES[form.role].text}</small></label>
            {form.role === 'vendor' && <label>Vendor<VendorPick vendors={vendors} value={form.vendor} onChange={set('vendor')} /></label>}
          </div>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="btn-row"><button className="btn primary">Add user</button><button type="button" className="btn ghost" onClick={() => setAdding(false)}>Cancel</button></div>
        </form>
      )}

      <div className="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Can</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {list?.map((u) => (editing?.id === u._id ? (
              <tr key={u._id} className="editing">
                <td colSpan={5}>
                  <form className="user-edit" onSubmit={(e) => save(e, u)}>
                    <b>{u.name}</b>
                    <select value={editing.role} onChange={setEdit('role')} aria-label="Role">
                      {Object.entries(ROLES).map(([r, { label }]) => <option key={r} value={r}>{label}</option>)}
                    </select>
                    {editing.role === 'vendor' && <VendorPick vendors={vendors} value={editing.vendor} onChange={setEdit('vendor')} />}
                    <input type="password" minLength="8" placeholder="New password (optional)" value={editing.password} onChange={setEdit('password')} aria-label="New password" />
                    <button className="btn primary small">Save</button>
                    <button type="button" className="btn ghost small" onClick={() => setEditing(null)}>Cancel</button>
                  </form>
                </td>
              </tr>
            ) : (
              <tr key={u._id}>
                <td><b>{u.name}</b>{u._id === user.id && <span className="muted"> (you)</span>}</td><td>{u.email}</td>
                <td><span className="badge neutral">{ROLES[u.role]?.label ?? 'Admin'}</span></td>
                <td className="muted">{u.vendor?.name ? `Sends bills for ${u.vendor.name}` : ROLES[u.role]?.text ?? 'Manages these accounts'}</td>
                <td className="num">
                  {ROLES[u.role] && (
                    <span className="btn-row row-actions">
                      <button className="link-btn" onClick={() => setEditing({ id: u._id, role: u.role, vendor: u.vendor?._id ?? '', password: '' })} aria-label={`Change ${u.name}`}>Change</button>
                      <button className="link-btn danger-text" onClick={() => remove(u)} aria-label={`Remove ${u.name}`}>Remove</button>
                    </span>
                  )}
                </td>
              </tr>
            )))}
          </tbody>
        </table>
        {!list && <div className="loading" role="status">Loading users…</div>}
      </div>
    </>
  );
}
