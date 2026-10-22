import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { User, Vendor, PurchaseOrder, Invoice, Notification } from './models/index.js';
import { verify } from './services/verify.js';
import { today } from './services/dates.js';
import { billPdf } from './services/billPdf.js';
import fs from 'node:fs';
import path from 'node:path';

const DAY = 86400000;
const ago = (d) => new Date(+today() - d * DAY); // calendar days, stored like the form stores them
const ahead = (d) => new Date(+today() + d * DAY);

await mongoose.connect(process.env.MONGO_URI);
await Promise.all([User, Vendor, PurchaseOrder, Invoice, Notification].map((m) => m.deleteMany({})));

const passwordHash = await bcrypt.hash('password123', 10);
const [admin, finance, manager] = await User.create([
  { name: 'Asha Admin', email: 'admin@demo.com', role: 'admin', passwordHash },
  { name: 'Farid Finance', email: 'finance@demo.com', role: 'finance', passwordHash },
  { name: 'Meera Manager', email: 'manager@demo.com', role: 'manager', passwordHash },
]);

const [acme, globex, initech, sunrise, northwind] = await Vendor.create([
  { name: 'Acme Office Supplies', email: 'billing@acme.test', gstin: '29ABCDE1234F1Z5', paymentTermsDays: 30 },
  { name: 'Globex Logistics', email: 'ap@globex.test', gstin: '27FGHIJ5678K1Z2', paymentTermsDays: 45 },
  { name: 'Initech Software', email: 'accounts@initech.test', gstin: '33KLMNO9012P1Z8', paymentTermsDays: 15, active: false },
  { name: 'Sunrise Facility Services', email: 'invoices@sunrise.test', gstin: '29QRSTU3456V1Z1', paymentTermsDays: 30 },
  { name: 'Northwind Electricals', email: 'finance@northwind.test', gstin: '24WXYZA7890B1Z4', paymentTermsDays: 21 },
]);

const [poAcme, poGlobex, poSunrise, poNorth] = await PurchaseOrder.create([
  { poNumber: 'PO-1001', vendor: acme._id, amount: 50000 },
  { poNumber: 'PO-1002', vendor: globex._id, amount: 120000 },
  { poNumber: 'PO-1003', vendor: sunrise._id, amount: 90000 },
  { poNumber: 'PO-1004', vendor: northwind._id, amount: 40000 },
]);
await PurchaseOrder.create({ poNumber: 'PO-0990', vendor: acme._id, amount: 15000, status: 'closed' });

const vendorsById = new Map([acme, globex, initech, sunrise, northwind].map((v) => [String(v._id), v]));
const posById = new Map([poAcme, poGlobex, poSunrise, poNorth].map((p) => [String(p._id), p]));
const h = (action, by, at, note) => ({ action, by: by._id, at, note });

// Real check results, computed the same way the API does.
const checksFor = (inv, extra = {}) => verify(inv, {
  vendor: vendorsById.get(String(inv.vendor)),
  po: inv.purchaseOrder && posById.get(String(inv.purchaseOrder)),
  ...extra,
});

const invoices = [
  // Paid in full
  { invoiceNumber: 'ACME/24-25/118', vendor: acme._id, purchaseOrder: poAcme._id, amount: 20000, invoiceDate: ago(80), dueDate: ago(50),
    status: 'paid', submittedAt: ago(79), approvedAt: ago(77), paidAt: ago(55),
    payments: [{ amount: 20000, date: ago(55), method: 'NEFT', reference: 'UTR4471023' }],
    history: [h('submitted', finance, ago(79)), h('verified', finance, ago(79)), h('approved', manager, ago(77)), h('payment 20000', finance, ago(55), 'UTR4471023')] },
  { invoiceNumber: 'SFS-2291', vendor: sunrise._id, purchaseOrder: poSunrise._id, amount: 42000, invoiceDate: ago(45), dueDate: ago(15),
    status: 'paid', submittedAt: ago(44), approvedAt: ago(41), paidAt: ago(18),
    payments: [{ amount: 42000, date: ago(18), method: 'RTGS', reference: 'RTGS88120' }],
    history: [h('submitted', finance, ago(44)), h('verified', finance, ago(44)), h('approved', manager, ago(41)), h('payment 42000', finance, ago(18), 'RTGS88120')] },
  { invoiceNumber: 'NWE-0457', vendor: northwind._id, amount: 18500, invoiceDate: ago(20), dueDate: ahead(1),
    status: 'paid', submittedAt: ago(19), approvedAt: ago(17), paidAt: ago(6),
    payments: [{ amount: 18500, date: ago(6), method: 'UPI', reference: 'UPI-55120' }],
    history: [h('submitted', finance, ago(19)), h('verified', finance, ago(19)), h('approved', manager, ago(17)), h('payment 18500', finance, ago(6), 'UPI-55120')] },
  // Partly paid and overdue
  { invoiceNumber: 'GLX-310', vendor: globex._id, purchaseOrder: poGlobex._id, amount: 60000, invoiceDate: ago(70), dueDate: ago(25),
    status: 'partially_paid', submittedAt: ago(69), approvedAt: ago(66),
    payments: [{ amount: 25000, date: ago(20), method: 'NEFT', reference: 'UTR4490117' }],
    history: [h('submitted', finance, ago(69)), h('verified', finance, ago(69)), h('approved', manager, ago(66)), h('payment 25000', finance, ago(20), 'UTR4490117')] },
  // Ready to pay: one badly overdue, one due in 2 days, one comfortable
  { invoiceNumber: 'ACME/24-25/131', vendor: acme._id, amount: 8000, invoiceDate: ago(100), dueDate: ago(70),
    status: 'approved', submittedAt: ago(99), approvedAt: ago(95),
    history: [h('submitted', finance, ago(99)), h('verified', finance, ago(99)), h('approved', manager, ago(95))] },
  { invoiceNumber: 'GLX-311', vendor: globex._id, amount: 15000, invoiceDate: ago(43), dueDate: ahead(2),
    status: 'approved', submittedAt: ago(42), approvedAt: ago(40),
    history: [h('submitted', finance, ago(42)), h('verified', finance, ago(42)), h('approved', manager, ago(40))] },
  { invoiceNumber: 'SFS-2318', vendor: sunrise._id, purchaseOrder: poSunrise._id, amount: 24000, invoiceDate: ago(8), dueDate: ahead(22),
    status: 'approved', submittedAt: ago(7), approvedAt: ago(5),
    history: [h('submitted', finance, ago(7)), h('verified', finance, ago(7)), h('approved', manager, ago(5), 'Matches March cleaning contract')] },
  // Waiting for approval: one fresh, one stale (triggers a reminder)
  { invoiceNumber: 'GLX-312', vendor: globex._id, purchaseOrder: poGlobex._id, amount: 30000, invoiceDate: ago(5), dueDate: ahead(40),
    status: 'pending_approval', submittedAt: ago(4), extra: { poInvoicedTotal: 60000 },
    history: [h('submitted', finance, ago(4)), h('verified', finance, ago(4))] },
  { invoiceNumber: 'NWE-0462', vendor: northwind._id, purchaseOrder: poNorth._id, amount: 12750, invoiceDate: ago(1), dueDate: ahead(20),
    status: 'pending_approval', submittedAt: ago(1),
    history: [h('submitted', finance, ago(1)), h('verified', finance, ago(1))] },
  // Needs fixing: inactive vendor; and one rejected by the manager
  { invoiceNumber: 'INI-77', vendor: initech._id, amount: 5000, invoiceDate: ago(3), dueDate: ahead(12),
    status: 'verification_failed', submittedAt: ago(3),
    history: [h('submitted', finance, ago(3)), h('verification_failed', finance, ago(3))] },
  { invoiceNumber: 'SFS-2302', vendor: sunrise._id, amount: 9600, invoiceDate: ago(12), dueDate: ahead(18),
    status: 'rejected', submittedAt: ago(11),
    history: [h('submitted', finance, ago(11)), h('verified', finance, ago(11)), h('rejected', manager, ago(10), 'Charged for 12 visits, service log shows 10. Ask vendor for a revised bill.')] },
];

// The database is being reset, so uploaded files from earlier runs are orphans: clear them,
// then write a demo PDF bill for every seeded invoice so the invoice page has something to show.
const uploads = path.resolve('uploads');
fs.mkdirSync(uploads, { recursive: true });
for (const f of fs.readdirSync(uploads)) if (f !== '.gitkeep') fs.unlinkSync(path.join(uploads, f));
const withBills = invoices.map(({ extra, ...inv }, n) => {
  const file = `seed-bill-${n + 1}`;
  const vendor = vendorsById.get(String(inv.vendor));
  const po = inv.purchaseOrder && posById.get(String(inv.purchaseOrder));
  fs.writeFileSync(path.join(uploads, file), billPdf({ ...inv, vendor, poNumber: po?.poNumber }));
  return { ...inv, checks: checksFor(inv, extra), attachment: file, attachmentName: `${inv.invoiceNumber.replace(/[\/]/g, '-')}.pdf` };
});
await Invoice.create(withBills);

console.log('Seeded. Logins (password "password123"): admin@demo.com, finance@demo.com, manager@demo.com');
await mongoose.disconnect();
