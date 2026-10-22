export const PO_TOLERANCE = 0.02;

// Pure rule check. ctx: { vendor, duplicateCount, po, poInvoicedTotal } loaded by the caller.
export function verify(inv, { vendor, duplicateCount = 0, po, poInvoicedTotal = 0 }) {
  const checks = [];
  const add = (rule, passed, message) => checks.push({ rule, passed, message });

  add('vendor_active', !!vendor?.active, vendor ? (vendor.active ? 'Vendor is active' : 'Vendor is inactive') : 'Vendor not found');
  add('not_duplicate', duplicateCount === 0, duplicateCount ? `Invoice number ${inv.invoiceNumber} already exists for this vendor` : 'Invoice number is unique for vendor');
  add('amount_positive', inv.amount > 0, inv.amount > 0 ? 'Amount is positive' : 'Amount must be greater than 0');
  const datesOk = new Date(inv.dueDate) >= new Date(inv.invoiceDate);
  add('due_date_valid', datesOk, datesOk ? 'Due date is on/after invoice date' : 'Due date is before invoice date');

  if (inv.purchaseOrder) {
    if (!po) add('po_match', false, 'Purchase order not found');
    else if (po.status !== 'open') add('po_match', false, `PO ${po.poNumber} is closed`);
    else if (String(po.vendor) !== String(vendor?._id ?? inv.vendor)) add('po_match', false, `PO ${po.poNumber} belongs to a different vendor`);
    else {
      const total = poInvoicedTotal + inv.amount;
      const limit = po.amount * (1 + PO_TOLERANCE);
      add('po_match', total <= limit,
        total <= limit
          ? `Within PO ${po.poNumber} amount (${total} of ${po.amount})`
          : `Exceeds PO ${po.poNumber}: ${total} invoiced vs ${po.amount} (+${PO_TOLERANCE * 100}% allowed)`);
    }
  }
  return checks;
}
