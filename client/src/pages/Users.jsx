import { useState } from 'react';
import api, { useLoad, errMsg } from '../api';
import { useAuth } from '../auth';
import { useToast } from '../components/Toast';
import PageHeader from '../components/PageHeader';
import useTitle from '../useTitle';

const blank = { name: '', email: '', password: '', role: 'finance' };
const ROLE_TEXT = { finance: 'Enters invoices, pays vendors', manager: 'Approves or rejects invoices', admin: 'Full access, manages users' };

export default function Users() {
  const { user } = useAuth();
  const toast = useToast();
  const [list, reload, loadError] = useLoad('/users');
  const [form, setForm] = useState(blank);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  useTitle('Users');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const add = async (e) => {
    e.preventDefault();
    try { await api.post('/users', form); toast(`${form.name} added. They can now sign in as ${form.role}.`); setForm(blank); setAdding(false); setError(''); reload(); }
    catch (err) { setError(errMsg(err)); }
  };
  const remove = async (u) => {
    if (!confirm(`Remove ${u.name}? They will no longer be able to sign in.`)) return;
    try { await api.delete(`/users/${u._id}`); toast(`${u.name} removed`); reload(); } catch (err) { toast(errMsg(err), 'bad'); }
  };

  if (loadError) return <p className="error" role="alert">{loadError}</p>;
  return (
    <>
      <PageHeader title="Users" actions={!adding && <button className="btn primary" onClick={() => setAdding(true)}>Add user</button>}>
        Who can sign in, and what each role is allowed to do.
      </PageHeader>
      {adding && (
        <form className="panel add-form" onSubmit={add}>
          <h2>New user</h2>
          <div className="fields">
            <label>Name<input value={form.name} onChange={set('name')} required autoFocus /></label>
            <label>Email<input type="email" value={form.email} onChange={set('email')} required /></label>
            <label>Temporary password<input type="password" minLength="8" value={form.password} onChange={set('password')} required /><small className="hint">At least 8 characters</small></label>
            <label>Role<select value={form.role} onChange={set('role')}>
              {Object.keys(ROLE_TEXT).map((r) => <option key={r} value={r}>{r}</option>)}
            </select><small className="hint">{ROLE_TEXT[form.role]}</small></label>
          </div>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="btn-row"><button className="btn primary">Add user</button><button type="button" className="btn ghost" onClick={() => setAdding(false)}>Cancel</button></div>
        </form>
      )}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Can</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {list?.map((u) => (
              <tr key={u._id}>
                <td><b>{u.name}</b>{u._id === user.id && <span className="muted"> (you)</span>}</td><td>{u.email}</td>
                <td><span className="badge neutral">{u.role}</span></td><td className="muted">{ROLE_TEXT[u.role]}</td>
                <td className="num">{u._id !== user.id && <button className="link-btn danger-text" onClick={() => remove(u)} aria-label={`Remove ${u.name}`}>Remove</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list && <div className="loading" role="status">Loading users…</div>}
      </div>
    </>
  );
}
