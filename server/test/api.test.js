// API integration tests: the real Express app against an in-memory MongoDB (never Atlas).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

process.env.JWT_SECRET = 'test-secret';
const { app } = await import('../app.js');
const { User, Vendor, PurchaseOrder, Invoice, Notification } = await import('../models/index.js');

const DAY = 86400000;
const day = (offset) => new Date(Date.now() + offset * DAY).toISOString().slice(0, 10);
let mongo, server, base;
const tok = {};
let acme, globex, po;

async function call(method, path, token, body) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}
const failed = (inv) => inv.checks.filter((c) => !c.passed).map((c) => c.rule);
const submit = (fields) => call('POST', '/api/invoices', tok.finance,
  { vendor: acme._id, amount: 1000, invoiceDate: day(0), dueDate: day(30), ...fields });

before(async () => {
  mongo = await MongoMemoryServer.create(); // random free port
  await mongoose.connect(mongo.getUri());
  const passwordHash = await bcrypt.hash('password123', 4);
  await User.create(['admin', 'finance', 'manager'].map((role) => ({ name: role, email: `${role}@t.test`, role, passwordHash })));
  [acme, globex] = await Vendor.create([{ name: 'Acme' }, { name: 'Globex' }]);
  po = await PurchaseOrder.create({ poNumber: 'PO-1', vendor: acme._id, amount: 1000 });
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  for (const role of ['admin', 'finance', 'manager']) {
    tok[role] = (await call('POST', '/api/auth/login', null, { email: `${role}@t.test`, password: 'password123' })).data.token;
  }
});

after(async () => {
  server?.close();
  await mongoose.disconnect();
  await mongo?.stop();
});

test('login: right password gets a token, wrong password gets 401', async () => {
  assert.ok(tok.finance && tok.manager && tok.admin);
  assert.equal((await call('POST', '/api/auth/login', null, { email: 'finance@t.test', password: 'nope' })).status, 401);
  assert.equal((await call('POST', '/api/auth/login', null, { email: 'nobody@t.test', password: 'password123' })).status, 401);
});

test('requests without a valid token get 401', async () => {
  assert.equal((await call('GET', '/api/invoices')).status, 401);
  assert.equal((await call('GET', '/api/invoices', 'garbage')).status, 401);
});

test('roles are enforced on the server (403)', async () => {
  assert.equal((await submit({ invoiceNumber: 'X-1' })).status, 201); // sanity: finance can submit
  assert.equal((await call('POST', '/api/invoices', tok.manager, { invoiceNumber: 'X-2' })).status, 403);
  assert.equal((await call('POST', '/api/vendors', tok.manager, { name: 'Nope' })).status, 403);
  assert.equal((await call('GET', '/api/users', tok.finance)).status, 403);
  assert.equal((await call('POST', '/api/reminders/run', tok.finance)).status, 403);
  assert.equal((await call('GET', '/api/users', tok.admin)).status, 200); // admin can do everything
});

test('invoice lifecycle: submit, duplicate, fix, reject, resubmit, approve, pay', async () => {
  let r = await submit({ invoiceNumber: 'INV-100', amount: 1200 });
  assert.equal(r.status, 201);
  assert.equal(r.data.status, 'pending_approval');
  assert.deepEqual(failed(r.data), []);
  const id = r.data._id;
  assert.ok(await Notification.exists({ role: 'manager', invoice: id, type: 'approval_needed' }), 'managers notified');

  r = await submit({ invoiceNumber: 'INV-100', amount: 50 });
  assert.equal(r.data.status, 'verification_failed');
  assert.deepEqual(failed(r.data), ['not_duplicate']);
  const dupId = r.data._id;

  r = await call('PUT', `/api/invoices/${dupId}`, tok.finance, { vendor: acme._id, invoiceNumber: 'INV-101', amount: 50, invoiceDate: day(0), dueDate: day(30) });
  assert.equal(r.data.status, 'pending_approval', 'edit and resubmit re-runs the checks');
  assert.equal((await call('PUT', `/api/invoices/${id}`, tok.finance, { invoiceNumber: 'Z' })).status, 409, 'cannot edit while pending');

  assert.equal((await call('POST', `/api/invoices/${dupId}/reject`, tok.manager, {})).status, 400, 'reject needs a note');
  r = await call('POST', `/api/invoices/${dupId}/reject`, tok.manager, { note: 'Billed twice' });
  assert.equal(r.data.status, 'rejected');
  assert.equal(r.data.history.at(-1).note, 'Billed twice');

  assert.equal((await call('POST', `/api/invoices/${id}/payments`, tok.finance, { amount: 100 })).status, 409, 'cannot pay before approval');
  r = await call('POST', `/api/invoices/${id}/approve`, tok.manager, {});
  assert.equal(r.data.status, 'approved');
  assert.ok(r.data.approvedAt);
  assert.equal((await call('POST', `/api/invoices/${id}/approve`, tok.manager, {})).status, 409, 'cannot approve twice');

  r = await call('POST', `/api/invoices/${id}/payments`, tok.finance, { amount: 200.5, method: 'NEFT' });
  assert.equal(r.data.status, 'partially_paid');
  r = await call('POST', `/api/invoices/${id}/payments`, tok.finance, { amount: 1000 });
  assert.equal(r.status, 400, 'overpayment blocked');
  assert.match(r.data.error, /exceeds balance/);
  assert.equal((await call('POST', `/api/invoices/${id}/payments`, tok.finance, { amount: 0 })).status, 400);
  r = await call('POST', `/api/invoices/${id}/payments`, tok.finance, { amount: 999.5 });
  assert.equal(r.data.status, 'paid');
  assert.ok(r.data.paidAt);
  assert.equal((await call('POST', `/api/invoices/${id}/payments`, tok.finance, { amount: 1 })).status, 409, 'paid is final');
});

test('bad input is rejected with 400, not a crash', async () => {
  assert.equal((await submit({ invoiceNumber: 'BAD-1', vendor: 'not-an-id' })).status, 400);
  assert.equal((await submit({ invoiceNumber: 'BAD-2', amount: 'abc' })).status, 400);
  const r = await submit({ invoiceNumber: 'BAD-3', amount: 0, dueDate: day(-5) });
  assert.deepEqual(failed(r.data), ['amount_positive', 'due_date_valid']);
});

test('PO tolerance counts earlier invoices on the same PO', async () => {
  let r = await submit({ invoiceNumber: 'PO-A', purchaseOrder: po._id, amount: 600 });
  assert.equal(r.data.status, 'pending_approval');
  r = await submit({ invoiceNumber: 'PO-B', purchaseOrder: po._id, amount: 420 }); // 1020 = PO + 2%
  assert.equal(r.data.status, 'pending_approval');
  r = await submit({ invoiceNumber: 'PO-C', purchaseOrder: po._id, amount: 1 }); // 1021 > limit
  assert.deepEqual(failed(r.data), ['po_match']);
  r = await submit({ invoiceNumber: 'PO-D', vendor: globex._id, purchaseOrder: po._id, amount: 1 });
  assert.deepEqual(failed(r.data), ['po_match'], 'PO from another vendor');
});

test('reminders: one per invoice per day, no duplicates on a second run', async () => {
  await Promise.all([Invoice.deleteMany({}), Notification.deleteMany({})]);
  const base = { vendor: acme._id, amount: 500, invoiceDate: new Date(Date.now() - 60 * DAY) };
  await Invoice.create([
    { ...base, invoiceNumber: 'R-OVERDUE', status: 'approved', dueDate: new Date(Date.now() - 10 * DAY) },
    { ...base, invoiceNumber: 'R-SOON', status: 'approved', dueDate: new Date(Date.now() + 2 * DAY) },
    { ...base, invoiceNumber: 'R-STALE', status: 'pending_approval', submittedAt: new Date(Date.now() - 5 * DAY), dueDate: new Date(Date.now() + 30 * DAY) },
    { ...base, invoiceNumber: 'R-PAID', status: 'paid', dueDate: new Date(Date.now() - 10 * DAY) },
  ]);
  let r = await call('POST', '/api/reminders/run', tok.admin);
  assert.equal(r.data.sent, 3);
  assert.equal(await Notification.countDocuments({ type: 'overdue' }), 2, 'finance and admin');
  assert.equal(await Notification.countDocuments({ type: 'due_soon', role: 'finance' }), 1);
  assert.equal(await Notification.countDocuments({ type: 'approval_stale', role: 'manager' }), 1);
  r = await call('POST', '/api/reminders/run', tok.admin);
  assert.equal(r.data.sent, 0);

  const mine = (await call('GET', '/api/notifications', tok.finance)).data;
  assert.equal(mine.length, 2);
  assert.ok(mine.every((n) => n.read === false));
  await call('POST', '/api/notifications/read-all', tok.finance);
  assert.ok((await call('GET', '/api/notifications', tok.finance)).data.every((n) => n.read));
  assert.ok((await call('GET', '/api/notifications', tok.admin)).data.every((n) => !n.read), 'read state is per user');
});

test('reports summary: shape and totals', async () => {
  await Invoice.deleteMany({});
  const base = { vendor: acme._id, invoiceDate: new Date(Date.now() - 60 * DAY) };
  const submittedAt = new Date(Date.now() - 50 * DAY);
  await Invoice.create([
    { ...base, invoiceNumber: 'S-PAID', amount: 1000, status: 'paid', dueDate: new Date(Date.now() - 20 * DAY),
      submittedAt, approvedAt: new Date(+submittedAt + 2 * DAY), paidAt: new Date(+submittedAt + 6 * DAY), payments: [{ amount: 1000 }] },
    { ...base, invoiceNumber: 'S-PART', amount: 2000, status: 'partially_paid', dueDate: new Date(Date.now() + 10 * DAY), payments: [{ amount: 500 }] },
    { ...base, invoiceNumber: 'S-LATE', amount: 300, status: 'approved', dueDate: new Date(Date.now() - 40 * DAY) },
    { ...base, invoiceNumber: 'S-FAIL', amount: 999, status: 'verification_failed', dueDate: new Date(Date.now() + 10 * DAY) },
  ]);
  const { status, data } = await call('GET', '/api/reports/summary', tok.manager);
  assert.equal(status, 200);
  for (const key of ['aging', 'byStatus', 'cycle', 'monthly', 'topVendors', 'totals']) assert.ok(key in data, key);
  assert.equal(data.totals.paid, 1500);
  assert.equal(data.totals.outstanding, 1800, 'failed invoices are not owed');
  const aging = Object.fromEntries(data.aging.map((a) => [a.bucket, a.amount]));
  assert.deepEqual(aging, { 'Not yet due': 1500, '31-60': 300 });
  assert.equal(data.byStatus.find((s) => s._id === 'verification_failed').count, 1);
  assert.deepEqual(data.topVendors.map((v) => [v.name, v.paid]), [['Acme', 1500]]);
  assert.equal(Math.round(data.cycle.toApproval), 2);
  assert.equal(Math.round(data.cycle.toPayment), 4);
  assert.equal((await call('GET', '/api/reports/summary', tok.finance)).status, 200);
});

test('CSV export neutralises spreadsheet formulas and escapes quotes', async () => {
  const evil = await Vendor.create({ name: '=HYPERLINK("http://x")' });
  await Invoice.create({ vendor: evil._id, invoiceNumber: '+SUM(A1)', amount: 10, status: 'approved', invoiceDate: new Date(), dueDate: new Date() });
  const res = await fetch(`${base}/api/reports/invoices.csv`, { headers: { authorization: `Bearer ${tok.finance}` } });
  assert.match(res.headers.get('content-type'), /text\/csv/);
  const csv = await res.text();
  const row = csv.split('\n').find((l) => l.includes('HYPERLINK'));
  assert.ok(row.startsWith(`"'+SUM(A1)","'=HYPERLINK(""http://x"")"`), row);
});

test('separation of duties: the person who entered an invoice cannot approve it', async () => {
  const inv = (await call('POST', '/api/invoices', tok.admin, { vendor: globex._id, invoiceNumber: 'SOD-1', amount: 100, invoiceDate: day(0), dueDate: day(10) })).data;
  assert.equal(inv.status, 'pending_approval');
  assert.equal((await call('POST', `/api/invoices/${inv._id}/approve`, tok.admin, {})).status, 403);
  assert.equal((await call('POST', `/api/invoices/${inv._id}/approve`, tok.manager, {})).status, 200);
});

test('two identical invoices submitted at the same moment: only one goes through', async () => {
  const body = { vendor: globex._id, invoiceNumber: 'RACE-1', amount: 50, invoiceDate: day(0), dueDate: day(10) };
  await Invoice.syncIndexes();
  const results = await Promise.all([1, 2, 3].map(() => call('POST', '/api/invoices', tok.finance, body)));
  const live = await Invoice.countDocuments({ invoiceNumber: 'RACE-1', status: 'pending_approval' });
  assert.equal(live, 1, `statuses: ${results.map((r) => `${r.status}/${r.data.status}`)}`);
});

test('money is rounded to paise and the payment date is the one entered', async () => {
  const inv = (await call('POST', '/api/invoices', tok.finance, { vendor: globex._id, invoiceNumber: 'ROUND-1', amount: 1000.305, invoiceDate: day(-5), dueDate: day(10) })).data;
  assert.equal(inv.amount, 1000.31);
  await call('POST', `/api/invoices/${inv._id}/approve`, tok.manager, {});
  assert.equal((await call('POST', `/api/invoices/${inv._id}/payments`, tok.finance, { amount: 1, date: day(5) })).status, 400, 'future payment date');
  await call('POST', `/api/invoices/${inv._id}/payments`, tok.finance, { amount: 500.1 });
  const r = await call('POST', `/api/invoices/${inv._id}/payments`, tok.finance, { amount: 500.21, date: day(-2) });
  assert.equal(r.data.status, 'paid');
  assert.equal(new Date(r.data.paidAt).toISOString().slice(0, 10), day(-2));
});

test('an invoice due today is not overdue yet', async () => {
  const inv = (await call('POST', '/api/invoices', tok.finance, { vendor: globex._id, invoiceNumber: 'TODAY-1', amount: 10, invoiceDate: day(-3), dueDate: day(0) })).data;
  const overdue = (await call('GET', '/api/invoices?overdue=true', tok.finance)).data.map((i) => i.invoiceNumber);
  assert.ok(!overdue.includes('TODAY-1'));
  assert.equal(inv.status, 'pending_approval');
});

test('line items set the total, including GST, and bad lines are refused', async () => {
  const base = { vendor: globex._id, invoiceDate: day(0), dueDate: day(10), notes: '  Steel for bay 3  ' };
  const lines = [{ description: 'MS angle', quantity: 2, rate: 100.5, gstRate: 18 }, { description: 'Loading', quantity: 1, rate: 40, gstRate: 0 }];
  const inv = (await call('POST', '/api/invoices', tok.finance, { ...base, invoiceNumber: 'LINES-1', amount: 1, lines: JSON.stringify(lines) })).data;
  assert.equal(inv.amount, 277.18); // 201 + 36.18 GST + 40
  assert.equal(inv.lines.length, 2);
  assert.equal(inv.notes, 'Steel for bay 3');
  const bad = await call('POST', '/api/invoices', tok.finance, { ...base, invoiceNumber: 'LINES-2', lines: [{ description: 'x', quantity: 1, rate: 10, gstRate: 7 }] });
  assert.equal(bad.status, 400);
  assert.equal((await call('POST', '/api/invoices', tok.finance, { ...base, invoiceNumber: 'LINES-3', lines: '{oops' })).status, 400);
});
