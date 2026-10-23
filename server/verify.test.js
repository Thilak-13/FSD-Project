import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verify } from './services/verify.js';

const vendor = { _id: 'v1', active: true };
const po = { _id: 'p1', poNumber: 'PO-1', vendor: 'v1', amount: 1000, status: 'open' };
const base = { invoiceNumber: 'INV-1', vendor: 'v1', amount: 500, invoiceDate: '2026-01-01', dueDate: '2026-01-31' };
const failed = (checks) => checks.filter((c) => !c.passed).map((c) => c.rule);

test('all checks pass', () => {
  assert.deepEqual(failed(verify({ ...base, purchaseOrder: 'p1' }, { vendor, po, poInvoicedTotal: 400 })), []);
});

test('missing or inactive vendor', () => {
  assert.deepEqual(failed(verify(base, { vendor: null })), ['vendor_active']);
  assert.deepEqual(failed(verify(base, { vendor: { ...vendor, active: false } })), ['vendor_active']);
});

test('duplicate invoice number', () => {
  assert.deepEqual(failed(verify(base, { vendor, duplicateCount: 1 })), ['not_duplicate']);
});

test('non-positive amount and bad due date', () => {
  assert.deepEqual(failed(verify({ ...base, amount: 0, dueDate: '2025-12-31' }, { vendor })), ['amount_positive', 'due_date_valid']);
});

test('PO tolerance: 0.5% over passes, beyond fails, earlier invoices count', () => {
  const inv = { ...base, purchaseOrder: 'p1' };
  assert.deepEqual(failed(verify({ ...inv, amount: 1005 }, { vendor, po })), []);
  assert.deepEqual(failed(verify({ ...inv, amount: 1005.01 }, { vendor, po })), ['po_match']);
  assert.deepEqual(failed(verify({ ...inv, amount: 120600 }, { vendor, po: { ...po, amount: 120000 } })), [], 'exact limit passes despite float rounding');
  assert.deepEqual(failed(verify({ ...inv, amount: 500 }, { vendor, po, poInvoicedTotal: 600 })), ['po_match']);
});

test('PO closed, other vendor, or missing', () => {
  const inv = { ...base, purchaseOrder: 'p1' };
  assert.deepEqual(failed(verify(inv, { vendor, po: { ...po, status: 'closed' } })), ['po_match']);
  assert.deepEqual(failed(verify(inv, { vendor, po: { ...po, vendor: 'v2' } })), ['po_match']);
  assert.deepEqual(failed(verify(inv, { vendor, po: null })), ['po_match']);
});

test('invoice numbers: vendor initials, financial year, next free sequence', async () => {
  const { nextInvoiceNumber, financialYear } = await import('./services/numbering.js');
  assert.equal(financialYear(new Date(2026, 9, 22)), '26-27');
  assert.equal(financialYear(new Date(2027, 1, 10)), '26-27', 'Jan-Mar belong to the year that started last April');
  assert.equal(nextInvoiceNumber('Globex Logistics', [], new Date(2026, 9, 22)), 'GL/26-27/0001');
  assert.equal(nextInvoiceNumber('Globex Logistics', ['GL/26-27/0007', 'GL/25-26/0040', 'OTHER-1'], new Date(2026, 9, 22)), 'GL/26-27/0008');
  assert.equal(nextInvoiceNumber('acme office supplies pvt', [], new Date(2026, 3, 1)), 'AOS/26-27/0001');
});

test('PO running total is compared in paise, so float sums cannot tip it over', () => {
  const inv = { ...base, purchaseOrder: 'p1', amount: 0.2 };
  assert.deepEqual(failed(verify(inv, { vendor, po: { ...po, amount: 0.3 / 1.005 }, poInvoicedTotal: 0.1 })), []);
});
