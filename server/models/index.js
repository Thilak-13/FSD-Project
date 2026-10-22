import mongoose from 'mongoose';
const { Schema, model } = mongoose;
const ref = (name) => ({ type: Schema.Types.ObjectId, ref: name });

export const ROLES = ['admin', 'finance', 'manager'];
export const STATUSES = ['submitted', 'verification_failed', 'pending_approval', 'approved', 'rejected', 'partially_paid', 'paid'];

export const User = model('User', new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ROLES, required: true },
}, { timestamps: true }));

export const Vendor = model('Vendor', new Schema({
  name: { type: String, required: true, trim: true },
  email: String,
  gstin: String,
  paymentTermsDays: { type: Number, default: 30, min: 0 },
  active: { type: Boolean, default: true },
}, { timestamps: true }));

export const PurchaseOrder = model('PurchaseOrder', new Schema({
  poNumber: { type: String, required: true, unique: true, trim: true },
  vendor: { ...ref('Vendor'), required: true },
  amount: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ['open', 'closed'], default: 'open' },
}, { timestamps: true }));

const invoiceSchema = new Schema({
  invoiceNumber: { type: String, required: true, trim: true },
  vendor: { ...ref('Vendor'), required: true },
  purchaseOrder: ref('PurchaseOrder'),
  amount: { type: Number, required: true },
  invoiceDate: { type: Date, required: true },
  dueDate: { type: Date, required: true },
  attachment: String,
  attachmentName: String,
  status: { type: String, enum: STATUSES, default: 'submitted', index: true },
  checks: [{ _id: false, rule: String, passed: Boolean, message: String }],
  history: [{ _id: false, action: String, by: ref('User'), at: { type: Date, default: Date.now }, note: String }],
  payments: [{ amount: { type: Number, required: true }, date: { type: Date, default: Date.now }, method: String, reference: String }],
  submittedAt: Date,
  approvedAt: Date,
  paidAt: Date,
  // Concurrent saves (e.g. two payments at once) fail with VersionError instead of overpaying.
}, { timestamps: true, optimisticConcurrency: true });
// One live invoice per vendor + number, enforced by the database so two simultaneous submits can't both pass.
// Failed and rejected invoices are left out so they can be corrected and resubmitted.
invoiceSchema.index({ vendor: 1, invoiceNumber: 1 }, {
  unique: true,
  partialFilterExpression: { status: { $in: ['pending_approval', 'approved', 'partially_paid', 'paid'] } },
});
export const Invoice = model('Invoice', invoiceSchema);

// Notifications target either one user or everyone with a role.
export const Notification = model('Notification', new Schema({
  user: ref('User'),
  role: { type: String, enum: ROLES },
  invoice: ref('Invoice'),
  type: String,
  message: String,
  readBy: [ref('User')],
}, { timestamps: true }));
