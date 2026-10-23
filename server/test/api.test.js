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
// Vendors send their own bills: Acme's login by default, Globex's when the bill is for Globex.
const submit = (fields) => call('POST', '/api/invoices', String(fields.vendor) === String(globex._id) ? tok.globex : tok.vendor,
  { vendor: acme._id, amount: 1000, invoiceDate: day(0), dueDate: day(30), ...fields });
const forward = (id) => call('POST', `/api/invoices/${id}/forward`, tok.finance, {});

before(async () => {
  mongo = await MongoMemoryServer.create(); // random free port
  await mongoose.connect(mongo.getUri());
  const passwordHash = await bcrypt.hash('password123', 4);
  [acme, globex] = await Vendor.create([{ name: 'Acme' }, { name: 'Globex' }]);
  await User.create(['admin', 'finance', 'manager'].map((role) => ({ name: role, email: `${role}@t.test`, role, passwordHash })));
  await User.create([{ name: 'Acme billing', email: 'vendor@t.test', role: 'vendor', vendor: acme._id, passwordHash },
    { name: 'Globex billing', email: 'globex@t.test', role: 'vendor', vendor: globex._id, passwordHash }]);
  po = await PurchaseOrder.create({ poNumber: 'PO-1', vendor: acme._id, amount: 1000 });
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  for (const role of ['admin', 'finance', 'manager', 'vendor', 'globex']) {
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
  assert.equal((await submit({ invoiceNumber: 'X-1' })).status, 201); // sanity: a vendor can submit
  assert.equal((await call('POST', '/api/invoices', tok.manager, { invoiceNumber: 'X-2' })).status, 403);
  assert.equal((await call('POST', '/api/invoices', tok.finance, { invoiceNumber: 'X-3' })).status, 403, 'finance reviews, it does not send bills');
  assert.equal((await call('GET', '/api/reports/summary', tok.vendor)).status, 403);
  assert.equal((await call('POST', '/api/purchase-orders', tok.vendor, { vendor: acme._id, amount: 1 })).status, 403);
  assert.equal((await call('POST', '/api/vendors', tok.manager, { name: 'Nope' })).status, 403);
  assert.equal((await call('GET', '/api/users', tok.finance)).status, 403);
  assert.equal((await call('POST', '/api/reminders/run', tok.finance)).status, 403);
  assert.equal((await call('GET', '/api/users', tok.admin)).status, 200);
});

test('invoice lifecycle: vendor submits, finance reviews, manager approves, finance pays', async () => {
  let r = await submit({ invoiceNumber: 'INV-100', amount: 1200 });
  assert.equal(r.status, 201);
  assert.equal(r.data.status, 'pending_review');
  assert.deepEqual(failed(r.data), []);
  const id = r.data._id;
  assert.ok(await Notification.exists({ role: 'finance', invoice: id, type: 'review_needed' }), 'finance notified');
  assert.equal((await call('POST', `/api/invoices/${id}/approve`, tok.manager, {})).status, 409, 'managers only see reviewed invoices');
  assert.equal((await call('POST', `/api/invoices/${id}/forward`, tok.manager, {})).status, 403);
  r = await forward(id);
  assert.equal(r.data.status, 'pending_approval');
  assert.ok(r.data.reviewedAt);
  assert.ok(await Notification.exists({ role: 'manager', invoice: id, type: 'approval_needed' }), 'managers notified');

  r = await submit({ invoiceNumber: 'INV-100', amount: 50 });
  assert.equal(r.data.status, 'verification_failed');
  assert.deepEqual(failed(r.data), ['not_duplicate']);
  const dupId = r.data._id;

  r = await call('PUT', `/api/invoices/${dupId}`, tok.vendor, { invoiceNumber: 'INV-101', amount: 50, invoiceDate: day(0), dueDate: day(30) });
  assert.equal(r.data.status, 'pending_review', 'edit and resubmit re-runs the checks');
  assert.equal((await call('PUT', `/api/invoices/${id}`, tok.vendor, { invoiceNumber: 'Z' })).status, 409, 'cannot edit while pending');
  assert.equal((await call('PUT', `/api/invoices/${dupId}`, tok.globex, { invoiceNumber: 'Z' })).status, 404, "another vendor's invoice is invisible");
  await forward(dupId);

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
  assert.equal((await submit({ invoiceNumber: 'BAD-1', purchaseOrder: 'not-an-id' })).status, 400);
  assert.equal((await submit({ invoiceNumber: 'BAD-2', amount: 'abc' })).status, 400);
  const r = await submit({ invoiceNumber: 'BAD-3', amount: 0, dueDate: day(-5) });
  assert.deepEqual(failed(r.data), ['amount_positive', 'due_date_valid']);
});

test('PO tolerance counts earlier invoices on the same PO', async () => {
  let r = await submit({ invoiceNumber: 'PO-A', purchaseOrder: po._id, amount: 600 });
  assert.equal(r.data.status, 'pending_review');
  r = await submit({ invoiceNumber: 'PO-B', purchaseOrder: po._id, amount: 405 }); // 1005 = PO + 0.5%
  assert.equal(r.data.status, 'pending_review');
  r = await submit({ invoiceNumber: 'PO-C', purchaseOrder: po._id, amount: 1 }); // 1021 > limit
  assert.deepEqual(failed(r.data), ['po_match']);
  r = await call('POST', '/api/invoices', tok.globex, { invoiceNumber: 'PO-D', purchaseOrder: po._id, amount: 1, invoiceDate: day(0), dueDate: day(30) });
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
  assert.equal(await Notification.countDocuments({ type: 'overdue' }), 2, 'finance and managers');
  assert.equal(await Notification.countDocuments({ type: 'overdue', role: 'admin' }), 0, 'admin does not get money alerts');
  assert.equal(await Notification.countDocuments({ type: 'due_soon', role: 'finance' }), 1);
  assert.equal(await Notification.countDocuments({ type: 'approval_stale', role: 'manager' }), 1);
  r = await call('POST', '/api/reminders/run', tok.admin);
  assert.equal(r.data.sent, 0);

  const mine = (await call('GET', '/api/notifications', tok.finance)).data;
  assert.equal(mine.length, 2);
  assert.ok(mine.every((n) => n.read === false));
  await call('POST', '/api/notifications/read-all', tok.finance);
  assert.ok((await call('GET', '/api/notifications', tok.finance)).data.every((n) => n.read));
  const managers = (await call('GET', '/api/notifications', tok.manager)).data;
  assert.ok(managers.length && managers.every((n) => !n.read), 'read state is per user');
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

test('admin manages accounts only: no invoices, purchase orders, payments or reports', async () => {
  const inv = (await submit({ invoiceNumber: 'ADM-1', amount: 100 })).data;
  await forward(inv._id);
  for (const [method, path, body] of [
    ['GET', '/api/invoices'], ['GET', `/api/invoices/${inv._id}`], ['POST', '/api/invoices', { invoiceNumber: 'ADM-2' }],
    ['POST', `/api/invoices/${inv._id}/approve`, {}], ['POST', `/api/invoices/${inv._id}/payments`, { amount: 1 }],
    ['GET', '/api/purchase-orders'], ['GET', '/api/reports/summary'], ['POST', '/api/vendors', { name: 'Nope' }],
  ]) assert.equal((await call(method, path, tok.admin, body)).status, 403, `${method} ${path}`);
  assert.equal((await call('GET', '/api/vendors', tok.admin)).status, 200, 'admin can list vendors to link vendor logins');
});

test('admin adds, changes and removes vendor, finance and manager accounts', async () => {
  assert.equal((await call('POST', '/api/users', tok.admin, { name: 'X', email: 'x@t.test', password: 'password123', role: 'admin' })).status, 400, 'no new admins from the app');
  assert.equal((await call('POST', '/api/users', tok.admin, { name: 'V', email: 'v@t.test', password: 'password123', role: 'vendor' })).status, 400, 'vendor logins need a vendor');
  const u = (await call('POST', '/api/users', tok.admin, { name: 'Pat', email: 'pat@t.test', password: 'password123', role: 'finance' })).data;
  let r = await call('PATCH', `/api/users/${u._id}`, tok.admin, { role: 'vendor', vendor: globex._id });
  assert.equal(r.data.role, 'vendor');
  assert.equal(String(r.data.vendor), String(globex._id));
  r = await call('PATCH', `/api/users/${u._id}`, tok.admin, { password: 'newpass123' });
  assert.equal(r.status, 200);
  assert.equal((await call('POST', '/api/auth/login', null, { email: 'pat@t.test', password: 'newpass123' })).status, 200, 'the new password works');
  const admins = (await call('GET', '/api/users', tok.admin)).data.filter((x) => x.role === 'admin');
  assert.equal((await call('PATCH', `/api/users/${admins[0]._id}`, tok.admin, { role: 'finance' })).status, 403);
  assert.equal((await call('PATCH', `/api/users/${u._id}`, tok.finance, { role: 'manager' })).status, 403, 'only admin manages accounts');
  assert.equal((await call('DELETE', `/api/users/${u._id}`, tok.admin)).status, 204);
});

test('a purchase order records why it exists and lists the bills against it', async () => {
  const created = (await call('POST', '/api/purchase-orders', tok.finance, { vendor: acme._id, amount: 2000,
    description: 'Laptop bags', purpose: 'New joiners in October', requestedBy: 'HR', neededBy: day(14) })).data;
  await submit({ invoiceNumber: 'POD-1', purchaseOrder: created._id, amount: 800 });
  const { status, data } = await call('GET', `/api/purchase-orders/${created._id}`, tok.vendor);
  assert.equal(status, 200);
  assert.equal(data.purpose, 'New joiners in October');
  assert.equal(data.requestedBy, 'HR');
  assert.equal(data.createdBy.name, 'finance');
  assert.equal(data.invoiced, 800);
  assert.deepEqual(data.invoices.map((i) => i.invoiceNumber), ['POD-1']);
  assert.equal((await call('GET', `/api/purchase-orders/${created._id}`, tok.globex)).status, 404, "other vendors can't open it");
});

test('two identical invoices submitted at the same moment: only one goes through', async () => {
  const body = { vendor: globex._id, invoiceNumber: 'RACE-1', amount: 50, invoiceDate: day(0), dueDate: day(10) };
  await Invoice.syncIndexes();
  const results = await Promise.all([1, 2, 3].map(() => call('POST', '/api/invoices', tok.globex, body)));
  const live = await Invoice.countDocuments({ invoiceNumber: 'RACE-1', status: 'pending_review' });
  assert.equal(live, 1, `statuses: ${results.map((r) => `${r.status}/${r.data.status}`)}`);
});

test('money is rounded to paise and the payment date is the one entered', async () => {
  const inv = (await call('POST', '/api/invoices', tok.globex, { invoiceNumber: 'ROUND-1', amount: 1000.305, invoiceDate: day(-5), dueDate: day(10) })).data;
  assert.equal(inv.amount, 1000.31);
  await forward(inv._id);
  await call('POST', `/api/invoices/${inv._id}/approve`, tok.manager, {});
  assert.equal((await call('POST', `/api/invoices/${inv._id}/payments`, tok.finance, { amount: 1, date: day(5) })).status, 400, 'future payment date');
  await call('POST', `/api/invoices/${inv._id}/payments`, tok.finance, { amount: 500.1 });
  const r = await call('POST', `/api/invoices/${inv._id}/payments`, tok.finance, { amount: 500.21, date: day(-2) });
  assert.equal(r.data.status, 'paid');
  assert.equal(new Date(r.data.paidAt).toISOString().slice(0, 10), day(-2));
});

test('an invoice due today is not overdue yet', async () => {
  const inv = (await call('POST', '/api/invoices', tok.globex, { invoiceNumber: 'TODAY-1', amount: 10, invoiceDate: day(-3), dueDate: day(0) })).data;
  const overdue = (await call('GET', '/api/invoices?overdue=true', tok.finance)).data.map((i) => i.invoiceNumber);
  assert.ok(!overdue.includes('TODAY-1'));
  assert.equal(inv.status, 'pending_review');
});

test('line items set the total, including GST, and bad lines are refused', async () => {
  const base = { vendor: globex._id, invoiceDate: day(0), dueDate: day(10), notes: '  Steel for bay 3  ' };
  const lines = [{ description: 'MS angle', quantity: 2, rate: 100.5, gstRate: 18 }, { description: 'Loading', quantity: 1, rate: 40, gstRate: 0 }];
  const inv = (await call('POST', '/api/invoices', tok.globex, { ...base, invoiceNumber: 'LINES-1', amount: 1, lines: JSON.stringify(lines) })).data;
  assert.equal(inv.amount, 277.18); // 201 + 36.18 GST + 40
  assert.equal(inv.lines.length, 2);
  assert.equal(inv.notes, 'Steel for bay 3');
  const bad = await call('POST', '/api/invoices', tok.globex, { ...base, invoiceNumber: 'LINES-2', lines: [{ description: 'x', quantity: 1, rate: 10, gstRate: 7 }] });
  assert.equal(bad.status, 400);
  assert.equal((await call('POST', '/api/invoices', tok.globex, { ...base, invoiceNumber: 'LINES-3', lines: '{oops' })).status, 400);
});

test('purchase orders report how much has been invoiced against them', async () => {
  const p = (await PurchaseOrder.create({ poNumber: 'PO-INV', vendor: globex._id, amount: 500 }));
  await call('POST', '/api/invoices', tok.globex, { purchaseOrder: p._id, invoiceNumber: 'POI-1', amount: 200, invoiceDate: day(0), dueDate: day(10) });
  await call('POST', '/api/invoices', tok.globex, { purchaseOrder: p._id, invoiceNumber: 'POI-2', amount: 900, invoiceDate: day(0), dueDate: day(10) }); // fails PO check, so not counted
  const list = (await call('GET', '/api/purchase-orders', tok.manager)).data;
  assert.equal(list.find((x) => x.poNumber === 'PO-INV').invoiced, 200);
});

test('finance can return an invoice to its vendor, who fixes and resubmits it', async () => {
  const inv = (await submit({ invoiceNumber: 'RET-1', amount: 300 })).data;
  assert.equal((await call('POST', `/api/invoices/${inv._id}/return`, tok.finance, {})).status, 400, 'a reason is required');
  let r = await call('POST', `/api/invoices/${inv._id}/return`, tok.finance, { note: 'Attach the delivery note' });
  assert.equal(r.data.status, 'returned');
  const vendorAlerts = (await call('GET', '/api/notifications', tok.vendor)).data;
  assert.ok(vendorAlerts.some((n) => n.type === 'returned' && n.message.includes('Attach the delivery note')), 'the vendor is told why');
  assert.ok(!(await call('GET', '/api/notifications', tok.globex)).data.some((n) => n.type === 'returned'), 'other vendors are not');
  r = await call('PUT', `/api/invoices/${inv._id}`, tok.vendor, { invoiceNumber: 'RET-1', amount: 300, invoiceDate: day(0), dueDate: day(30) });
  assert.equal(r.data.status, 'pending_review');
});

test('vendors only see their own invoices, vendor record and purchase orders', async () => {
  const mine = (await submit({ invoiceNumber: 'SEE-1' })).data;
  const theirs = (await call('POST', '/api/invoices', tok.globex, { invoiceNumber: 'SEE-2', amount: 10, invoiceDate: day(0), dueDate: day(5), vendor: acme._id })).data;
  assert.equal(String(theirs.vendor), String(globex._id), 'a vendor cannot bill as someone else');
  const list = (await call('GET', `/api/invoices?vendor=${globex._id}`, tok.vendor)).data;
  assert.ok(list.length && list.every((i) => String(i.vendor._id) === String(acme._id)));
  assert.equal((await call('GET', `/api/invoices/${theirs._id}`, tok.vendor)).status, 404);
  assert.equal((await call('GET', `/api/invoices/${mine._id}`, tok.vendor)).status, 200);
  assert.deepEqual((await call('GET', '/api/vendors', tok.vendor)).data.map((v) => v.name), ['Acme']);
  assert.ok((await call('GET', '/api/purchase-orders', tok.globex)).data.every((p) => String(p.vendor._id) === String(globex._id)));
});

test('next invoice number follows the vendor prefix and financial year', async () => {
  const { data } = await call('GET', '/api/invoices/next-number', tok.vendor);
  assert.match(data.invoiceNumber, /^A\/\d{2}-\d{2}\/\d{4}$/);
  const first = await submit({ invoiceNumber: data.invoiceNumber });
  assert.equal(first.status, 201);
  const next = (await call('GET', '/api/invoices/next-number', tok.vendor)).data.invoiceNumber;
  assert.equal(Number(next.slice(-4)), Number(data.invoiceNumber.slice(-4)) + 1);
  assert.equal((await call('GET', '/api/invoices/next-number', tok.finance)).status, 400, 'non-vendors must say which vendor');
});

test('a PO created without a number gets the next one', async () => {
  const r = await call('POST', '/api/purchase-orders', tok.finance, { vendor: acme._id, amount: 100, description: 'Printer paper' });
  assert.equal(r.status, 201);
  assert.match(r.data.poNumber, /^PO-\d{4,}$/);
  assert.equal(r.data.description, 'Printer paper');
});
