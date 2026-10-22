import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import { Invoice, Vendor, PurchaseOrder } from '../models/index.js';
import { requireRole } from '../middleware/auth.js';
import { verify } from '../services/verify.js';
import { notify } from '../services/notify.js';
import { today, round2 } from '../services/dates.js';

export const OPEN = ['pending_approval', 'approved', 'partially_paid'];
const EDITABLE = ['verification_failed', 'rejected'];
// Statuses that don't count toward duplicates or PO totals.
const DEAD = ['verification_failed', 'rejected'];
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
  inv.status = ok ? 'pending_approval' : 'verification_failed';
  inv.submittedAt = new Date();
  inv.history.push({ action: ok ? 'verified' : 'verification_failed', by: userId });
  try {
    await inv.save();
  } catch (e) {
    // Partial unique index catches a duplicate submitted at the same moment as this one.
    if (e.code === 11000) throw Object.assign(new Error(`Invoice ${inv.invoiceNumber} already exists for this vendor`), { status: 409 });
    throw e;
  }
  if (ok) await notify([{ role: 'manager' }], { invoice: inv._id, type: 'approval_needed', message: `Invoice ${inv.invoiceNumber} awaits approval` });
  return inv;
}

const fields = ({ invoiceNumber, vendor, purchaseOrder, amount, invoiceDate, dueDate }) =>
  ({ invoiceNumber, vendor, purchaseOrder: purchaseOrder || undefined, amount: round2(amount), invoiceDate, dueDate });

r.get('/', async (req, res) => {
  const { status, vendor, overdue } = req.query;
  const q = {};
  if (status) q.status = status;
  if (vendor) q.vendor = vendor;
  if (overdue === 'true') Object.assign(q, { status: { $in: OPEN }, dueDate: { $lt: today() } });
  res.json(await populate(Invoice.find(q).sort({ createdAt: -1 })).select('-history -checks'));
});

r.get('/:id', async (req, res) => {
  const inv = await populate(Invoice.findById(req.params.id));
  inv ? res.json(inv) : res.status(404).json({ error: 'Not found' });
});

r.get('/:id/attachment', async (req, res) => {
  const inv = await Invoice.findById(req.params.id);
  if (!inv?.attachment) return res.status(404).json({ error: 'No attachment' });
  const ext = path.extname(inv.attachmentName || '');
  // Stored files have no extension, so take the type from the original name.
  res.type(ext || 'application/octet-stream');
  const file = path.resolve('uploads', inv.attachment);
  if (req.query.inline) return res.sendFile(file, { headers: { 'Content-Disposition': 'inline' } });
  res.download(file, `${inv.invoiceNumber.replace(/[\\/]/g, '-')}${ext}`);
});

r.post('/', requireRole('finance'), upload.single('attachment'), async (req, res) => {
  const inv = new Invoice({ ...fields(req.body), history: [{ action: 'submitted', by: req.user.id }] });
  attach(inv, req.file);
  await inv.validate();
  res.status(201).json(await runVerification(inv, req.user.id));
});

r.put('/:id', requireRole('finance'), upload.single('attachment'), async (req, res) => {
  const inv = await Invoice.findById(req.params.id);
  if (!inv) return res.status(404).json({ error: 'Not found' });
  if (!EDITABLE.includes(inv.status)) return res.status(409).json({ error: `Cannot edit an invoice that is ${inv.status}` });
  inv.set(fields(req.body));
  attach(inv, req.file);
  inv.history.push({ action: 'resubmitted', by: req.user.id });
  res.json(await runVerification(inv, req.user.id));
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
  await notify([{ role: 'finance' }], { invoice: inv._id, type: inv.status, message: `Invoice ${inv.invoiceNumber} was ${inv.status}${note ? `: ${note}` : ''}` });
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
  res.json(inv);
});

export default r;
