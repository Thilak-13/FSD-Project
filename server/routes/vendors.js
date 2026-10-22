import { Router } from 'express';
import { Vendor, PurchaseOrder } from '../models/index.js';
import { requireRole } from '../middleware/auth.js';

// Only these fields may be set from the client (blocks mass assignment of _id, timestamps, etc.).
const pick = (body, keys) => Object.fromEntries(keys.filter((k) => body[k] !== undefined).map((k) => [k, body[k]]));
const VENDOR_FIELDS = ['name', 'email', 'gstin', 'paymentTermsDays', 'active'];
const PO_FIELDS = ['poNumber', 'vendor', 'amount', 'status'];
const opts = { new: true, runValidators: true };
const found = (res, doc) => (doc ? res.json(doc) : res.status(404).json({ error: 'Not found' }));

// Vendors and purchase orders: everyone can read, finance edits.
export const vendors = Router();
vendors.get('/', async (req, res) => res.json(await Vendor.find().sort('name')));
vendors.post('/', requireRole('finance'), async (req, res) => res.status(201).json(await Vendor.create(pick(req.body, VENDOR_FIELDS))));
vendors.put('/:id', requireRole('finance'), async (req, res) =>
  found(res, await Vendor.findByIdAndUpdate(req.params.id, pick(req.body, VENDOR_FIELDS), opts)));

export const purchaseOrders = Router();
purchaseOrders.get('/', async (req, res) =>
  res.json(await PurchaseOrder.find(req.query.vendor ? { vendor: String(req.query.vendor) } : {}).populate('vendor', 'name').sort('-createdAt')));
purchaseOrders.post('/', requireRole('finance'), async (req, res) => res.status(201).json(await PurchaseOrder.create(pick(req.body, PO_FIELDS))));
purchaseOrders.put('/:id', requireRole('finance'), async (req, res) =>
  found(res, await PurchaseOrder.findByIdAndUpdate(req.params.id, pick(req.body, PO_FIELDS), opts)));
