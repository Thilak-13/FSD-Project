// A minimal one-page PDF bill for demo data, written by hand so seeding needs no PDF library.
const esc = (t) => String(t).replace(/[\()]/g, (c) => `\${c}`);
const inr = (n) => `Rs. ${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const d = (x) => new Date(x).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

export function billPdf({ vendor, invoiceNumber, invoiceDate, dueDate, amount, poNumber }) {
  const taxable = Math.round((amount / 1.18) * 100) / 100;
  const gst = Math.round((amount - taxable) * 100) / 100;
  // [x, y, size, text, bold]
  const lines = [
    [50, 780, 20, vendor.name, true],
    [50, 760, 10, `GSTIN ${vendor.gstin || '-'}`],
    [50, 746, 10, vendor.email || ''],
    [400, 780, 16, 'TAX INVOICE', true],
    [400, 760, 10, `Invoice no: ${invoiceNumber}`],
    [400, 746, 10, `Invoice date: ${d(invoiceDate)}`],
    [400, 732, 10, `Due date: ${d(dueDate)}`],
    [50, 690, 10, 'Bill to', true],
    [50, 676, 10, 'Demo Company Pvt Ltd, Chennai'],
    [50, 662, 10, poNumber ? `Against purchase order ${poNumber}` : 'No purchase order'],
    [50, 610, 11, 'Description', true], [430, 610, 11, 'Amount', true],
    [50, 586, 10, 'Goods / services as per agreement'], [430, 586, 10, inr(taxable)],
    [50, 566, 10, 'GST @ 18%'], [430, 566, 10, inr(gst)],
    [50, 530, 12, 'Total payable', true], [430, 530, 12, inr(amount), true],
    [50, 480, 9, `Please pay within the agreed terms to ${vendor.name}.`],
    [50, 120, 8, 'Demo bill generated for InvoiceFlow seed data.'],
  ];
  const text = lines.map(([x, y, s, t, b]) => `BT /${b ? 'F2' : 'F1'} ${s} Tf ${x} ${y} Td (${esc(t)}) Tj ET`).join('\n')
    + '\n0.8 w 50 625 m 545 625 l S 50 548 m 545 548 l S';
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets = objs.map((o, i) => { const at = Buffer.byteLength(out); out += `${i + 1} 0 obj\n${o}\nendobj\n`; return at; });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
