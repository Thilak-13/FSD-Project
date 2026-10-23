import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import { Invoice, Vendor, PurchaseOrder, User } from '../models/index.js';
import { requireRole } from '../middleware/auth.js';
import { verify, lineTotals, GST_RATES } from '../services/verify.js';
import { notify } from '../services/notify.js';
import { today, round2 } from '../services/dates.js';
import { nextInvoiceNumber } from '../services/numbering.js';

// Unpaid invoices that are still on their way to being paid (used for overdue and due-soon).
export const OPEN = ['pending_review', 'pending_approval', 'approved', 'partially_paid'];
// Back with the vendor: they can correct and resubmit these.
const EDITABLE = ['verification_failed', 'returned', 'rejected'];
// Statuses that don't count toward duplicates or PO totals.
export const DEAD = ['verification_failed', 'returned', 'rejected'];
const cents = (n) => Math.round(n * 100);

const upload = multer({
  dest: path.resolve('uploads'),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => /^(application\/pdf|image\/(png|jpeg))$/.test(file.mimetype)
    ? cb(null, true)
    : cb(Object.assign(new Error('Attachment must be a PDF, PNG or JPEG'), { status: 400 })),
});
const attach = (inv, file) => file && Object.assign(inv, { attachment: file.filename, attachmentName: file.originalname });

const r = Router();

// Vendor users only ever see their own vendor's invoices; everyone else sees all of them.
const scope = (req) => (req.user.role === 'vendor' ? { vendor: req.user.vendor } : {});
const visible = (req, inv) => inv && (req.user.role !== 'vendor' || String(inv.vendor?._id ?? inv.vendor) === req.user.vendor);
// Tell the vendor's own users about their invoice (never a role-wide alert, which every vendor would see).
async function notifyVendor(inv, type, message) {
  const users = await User.find({ role: 'vendor', vendor: inv.vendor?._id ?? inv.vendor }).select('_id').lean();
  if (users.length) await notify(users.map((u) => ({ user: u._id })), { invoice: inv._id, type, message });
}

const populate = (q) => q.populate('vendor', 'name gstin').populate('purchaseOrder', 'poNumber amount').populate('history.by', 'name role');

async function runVerification(inv, userId) {
  const others = { _id: { $ne: inv._id }, status: { $nin: DEAD } };
  const [vendor, duplicateCount, po] = await Promise.all([
    Vendor.findById(inv.vendor),
    Invoice.countDocuments({ ...others, vendor: inv.vendor, invoiceNumber: inv.invoiceNumber }),
    inv.purchaseOrder ? PurchaseOrder.findById(inv.purchaseOrder) : null,
  ]);
  const [{ total = 0 } = {}] = po
    ? await Invoice.aggregate([{ $match: { ...others, purchaseOrder: po._id } }, { $group: { _id: null, total: { $sum: '$amount' } } }])
    : [];

  inv.checks = verify(inv, { vendor, duplicateCount, po, poInvoicedTotal: total });
  const ok = inv.checks.every((c) => c.passed);
  inv.status = ok ? 'pending_review' : 'verification_failed';
  inv.submittedAt = new Date();
  inv.reviewedAt = undefined;
  inv.history.push({ action: ok ? 'verified' : 'verification_failed', by: userId });
  try {
    await inv.save();
  } catch (e) {
    // Partial unique index catches a duplicate submitted at the same moment as this one.
    if (e.code === 11000) throw Object.assign(new Error(`Invoice ${inv.invoiceNumber} already exists for this vendor`), { status: 409 });
    throw e;
  }
  if (ok) {
    const vendor = await Vendor.findById(inv.vendor).select('name').lean();
    await notify([{ role: 'finance' }], { invoice: inv._id, type: 'review_needed', message: `Invoice ${inv.invoiceNumber} from ${vendor?.name ?? 'a vendor'} is ready for your review` });
  }
  return inv;
}

const badLines = () => Object.assign(new Error('Each line needs a description, a quantity above 0, a rate of 0 or more, and a GST rate of 0, 5, 12, 18 or 28%'), { status: 400 });

// Lines arrive as a JSON string in multipart forms. Without lines, the entered amount is the total.
function parseLines(raw) {
  if (raw == null || raw === '') return undefined;
  let lines;
  try { lines = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { throw badLines(); }
  if (!Array.isArray(lines) || !lines.length || lines.length > 100) throw badLines();
  return lines.map((l) => {
    const line = { description: String(l?.description ?? '').trim().slice(0, 200), quantity: Number(l?.quantity), rate: Number(l?.rate), gstRate: Number(l?.gstRate) };
    if (!line.description || !(line.quantity > 0) || !(line.rate >= 0) || !GST_RATES.includes(line.gstRate)) throw badLines();
    return line;
  });
}

const fields = ({ invoiceNumber, vendor, purchaseOrder, amount, invoiceDate, dueDate, lines, notes }) => {
  const parsed = parseLines(lines);
  return {
    invoiceNumber, vendor, purchaseOrder: purchaseOrder || undefined, invoiceDate, dueDate,
    lines: parsed ?? [], notes: String(notes ?? '').trim().slice(0, 1000) || undefined,
    amount: parsed ? lineTotals(parsed).total : round2(amount),
  };
};

r.get('/', async (req, res) => {
  const { status, vendor, overdue } = req.query;
  const q = {};
  if (status) q.status = String(status);
  if (vendor) q.vendor = String(vendor);
  Object.assign(q, scope(req));
  if (overdue === 'true') Object.assign(q, { status: { $in: OPEN }, dueDate: { $lt: today() } });
  res.json(await populate(Invoice.find(q).sort({ createdAt: -1 })).select('-history -checks'));
});

// The next free invoice number for a vendor, e.g. GL/26-27/0008. Vendors always get their own.
r.get('/next-number', async (req, res) => {
  const vendorId = req.user.role === 'vendor' ? req.user.vendor : String(req.query.vendor || '');
  const vendor = vendorId && await Vendor.findById(vendorId).select('name').lean().catch(() => null);
  if (!vendor) return res.status(400).json({ error: 'Choose a vendor first' });
  const used = await Invoice.find({ vendor: vendor._id }).distinct('invoiceNumber');
  res.json({ invoiceNumber: nextInvoiceNumber(vendor.name, used) });
});

r.get('/:id', async (req, res) => {
  const inv = await populate(Invoice.findById(req.params.id));
  visible(req, inv) ? res.json(inv) : res.status(404).json({ error: 'Not found' });
});

r.get('/:id/attachment', async (req, res) => {
  const inv = await Invoice.findById(req.params.id);
  if (!visible(req, inv) || !inv.attachment) return res.status(404).json({ error: 'No attachment' });
  const ext = path.extname(inv.attachmentName || '');
  // Stored files have no extension, so take the type from the original name.
  res.type(ext || 'application/octet-stream');
  const file = path.resolve('uploads', inv.attachment);
  if (req.query.inline) return res.sendFile(file, { headers: { 'Content-Disposition': 'inline' } });
  res.download(file, `${inv.invoiceNumber.replace(/[\\/]/g, '-')}${ext}`);
});

// Vendors send their own bills; the vendor is always theirs, whatever the form says. Admin can enter one for any vendor.
r.post('/', requireRole('vendor'), upload.single('attachment'), async (req, res) => {
  const inv = new Invoice({ ...fields(req.body), ...scope(req), history: [{ action: 'submitted', by: req.user.id }] });
  attach(inv, req.file);
  await inv.validate();
  res.status(201).json(await runVerification(inv, req.user.id));
});

r.put('/:id', requireRole('vendor'), upload.single('attachment'), async (req, res) => {
  const inv = await Invoice.findById(req.params.id);
  if (!visible(req, inv)) return res.status(404).json({ error: 'Not found' });
  if (!EDITABLE.includes(inv.status)) return res.status(409).json({ error: `Cannot edit an invoice that is ${inv.status}` });
  inv.set({ ...fields(req.body), ...scope(req) });
  attach(inv, req.file);
  inv.history.push({ action: 'resubmitted', by: req.user.id });
  res.json(await runVerification(inv, req.user.id));
});

// Finance looks over a checked invoice before it reaches a manager.
r.post('/:id/forward', requireRole('finance'), async (req, res) => {
  const inv = await Invoice.findById(req.params.id);
  if (!inv) return res.status(404).json({ error: 'Not found' });
  if (inv.status !== 'pending_review') return res.status(409).json({ error: `Invoice is ${inv.status}` });
  const note = String(req.body.note ?? '').trim();
  Object.assign(inv, { status: 'pending_approval', reviewedAt: new Date() });
  inv.history.push({ action: 'forwarded', by: req.user.id, note });
  await inv.save();
  await notify([{ role: 'manager' }], { invoice: inv._id, type: 'approval_needed', message: `Invoice ${inv.invoiceNumber} was reviewed by finance and awaits your approval` });
  res.json(inv);
});

r.post('/:id/return', requireRole('finance'), async (req, res) => {
  const note = String(req.body.note ?? '').trim();
  if (!note) return res.status(400).json({ error: 'Tell the vendor what to change' });
  const inv = await Invoice.findById(req.params.id);
  if (!inv) return res.status(404).json({ error: 'Not found' });
  if (inv.status !== 'pending_review') return res.status(409).json({ error: `Invoice is ${inv.status}` });
  inv.status = 'returned';
  inv.history.push({ action: 'returned', by: req.user.id, note });
  await inv.save();
  await notifyVendor(inv, 'returned', `Finance returned invoice ${inv.invoiceNumber}: ${note}`);
  res.json(inv);
});

const decide = (decision) => async (req, res) => {
  const note = String(req.body.note ?? '').trim();
  if (decision === 'reject' && !note) return res.status(400).json({ error: 'A note is required to reject' });
  const inv = await Invoice.findById(req.params.id);
  if (!inv) return res.status(404).json({ error: 'Not found' });
  if (inv.status !== 'pending_approval') return res.status(409).json({ error: `Invoice is ${inv.status}` });
  // Separation of duties: whoever entered the invoice can't approve or reject it.
  const enteredBy = [...inv.history].reverse().find((h) => ['submitted', 'resubmitted'].includes(h.action))?.by;
  if (String(enteredBy) === req.user.id) return res.status(403).json({ error: 'You entered this invoice, so another person must approve or reject it' });
  inv.status = decision === 'approve' ? 'approved' : 'rejected';
  if (decision === 'approve') inv.approvedAt = new Date();
  inv.history.push({ action: inv.status, by: req.user.id, note });
  await inv.save();
  const message = `Invoice ${inv.invoiceNumber} was ${inv.status}${note ? `: ${note}` : ''}`;
  await notify([{ role: 'finance' }], { invoice: inv._id, type: inv.status, message });
  await notifyVendor(inv, inv.status, message);
  res.json(inv);
};
r.post('/:id/approve', requireRole('manager'), decide('approve'));
r.post('/:id/reject', requireRole('manager'), decide('reject'));

r.post('/:id/payments', requireRole('finance'), async (req, res) => {
  const amount = round2(req.body.amount);
  const paidOn = req.body.date ? new Date(req.body.date) : new Date();
  if (isNaN(paidOn) || paidOn > new Date(+today() + 86400000)) return res.status(400).json({ error: 'Payment date must be a valid date, not in the future' });
  if (!(amount > 0)) return res.status(400).json({ error: 'Payment amount must be greater than 0' });
  const inv = await Invoice.findById(req.params.id);
  if (!inv) return res.status(404).json({ error: 'Not found' });
  if (!['approved', 'partially_paid'].includes(inv.status)) return res.status(409).json({ error: `Cannot pay an invoice that is ${inv.status}` });
  const paid = inv.payments.reduce((s, p) => s + cents(p.amount), 0);
  if (paid + cents(amount) > cents(inv.amount)) return res.status(400).json({ error: `Payment exceeds balance of ${(cents(inv.amount) - paid) / 100}` });

  inv.payments.push({ amount, date: paidOn, method: req.body.method, reference: req.body.reference });
  const full = paid + cents(amount) === cents(inv.amount);
  inv.status = full ? 'paid' : 'partially_paid';
  if (full) inv.paidAt = paidOn;
  inv.history.push({ action: `payment ${amount}`, by: req.user.id, note: req.body.reference });
  await inv.save();
  await notifyVendor(inv, 'paid', `${full ? 'Full payment' : 'Part-payment'} of ₹${amount.toLocaleString('en-IN')} recorded for invoice ${inv.invoiceNumber}`);
  res.json(inv);
});

export default r;
