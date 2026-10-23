import { Router } from 'express';
import { Vendor, PurchaseOrder, Invoice } from '../models/index.js';
import { requireRole } from '../middleware/auth.js';
import { DEAD } from './invoices.js';

// Only these fields may be set from the client (blocks mass assignment of _id, timestamps, etc.).
const pick = (body, keys) => Object.fromEntries(keys.filter((k) => body[k] !== undefined).map((k) => [k, body[k]]));
const VENDOR_FIELDS = ['name', 'email', 'gstin', 'paymentTermsDays', 'active'];
const PO_FIELDS = ['poNumber', 'vendor', 'amount', 'description', 'purpose', 'requestedBy', 'neededBy', 'status'];
const opts = { new: true, runValidators: true };
const found = (res, doc) => (doc ? res.json(doc) : res.status(404).json({ error: 'Not found' }));

// A vendor user only ever sees their own vendor record and the POs issued to them.
const own = (req, field) => (req.user.role === 'vendor' ? { [field]: req.user.vendor } : {});

// Vendors and purchase orders: everyone can read (vendors only their own), finance edits.
export const vendors = Router();
vendors.get('/', async (req, res) => res.json(await Vendor.find(own(req, '_id')).sort('name')));
vendors.post('/', requireRole('finance'), async (req, res) => res.status(201).json(await Vendor.create(pick(req.body, VENDOR_FIELDS))));
vendors.put('/:id', requireRole('finance'), async (req, res) =>
  found(res, await Vendor.findByIdAndUpdate(req.params.id, pick(req.body, VENDOR_FIELDS), opts)));

export const purchaseOrders = Router();
// Each PO comes with `invoiced`: the total of its live invoices (failed and rejected ones don't count, as in verification).
purchaseOrders.get('/', async (req, res) => {
  const q = { ...(req.query.vendor && { vendor: String(req.query.vendor) }), ...own(req, 'vendor') };
  const pos = await PurchaseOrder.find(q).populate('vendor', 'name').sort('-createdAt').lean();
  const totals = await Invoice.aggregate([
    { $match: { purchaseOrder: { $in: pos.map((p) => p._id) }, status: { $nin: DEAD } } },
    { $group: { _id: '$purchaseOrder', total: { $sum: '$amount' } } },
  ]);
  const byPo = new Map(totals.map((t) => [String(t._id), t.total]));
  res.json(pos.map((p) => ({ ...p, invoiced: byPo.get(String(p._id)) ?? 0 })));
});
// One PO with everything about it: who raised it, and every bill sent against it.
purchaseOrders.get('/:id', async (req, res) => {
  const po = await PurchaseOrder.findOne({ _id: req.params.id, ...own(req, 'vendor') })
    .populate('vendor', 'name gstin paymentTermsDays').populate('createdBy', 'name').lean();
  if (!po) return res.status(404).json({ error: 'Not found' });
  const invoices = await Invoice.find({ purchaseOrder: po._id }).select('invoiceNumber amount status invoiceDate dueDate payments').sort('-invoiceDate').lean();
  const invoiced = invoices.filter((i) => !DEAD.includes(i.status)).reduce((s, i) => s + i.amount, 0);
  res.json({ ...po, invoiced, invoices });
});

// Leave the PO number blank to get the next one in the PO-1001, PO-1002... series.
purchaseOrders.post('/', requireRole('finance'), async (req, res) => {
  const po = { ...pick(req.body, PO_FIELDS), createdBy: req.user.id };
  if (!String(po.poNumber ?? '').trim()) {
    const numbers = await PurchaseOrder.find({ poNumber: /^PO-\d+$/ }).distinct('poNumber');
    po.poNumber = `PO-${Math.max(1000, ...numbers.map((n) => Number(n.slice(3)))) + 1}`;
  }
  res.status(201).json(await PurchaseOrder.create(po));
});
purchaseOrders.put('/:id', requireRole('finance'), async (req, res) =>
  found(res, await PurchaseOrder.findByIdAndUpdate(req.params.id, pick(req.body, PO_FIELDS), opts)));
