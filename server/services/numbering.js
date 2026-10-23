// Invoice numbers in the usual Indian format: <vendor initials>/<financial year>/<4-digit sequence>, e.g. GL/26-27/0007.

// Initials of the vendor's name, up to 3 letters ("Globex Logistics" -> "GL").
export const vendorPrefix = (name) =>
  (String(name).match(/[A-Za-z0-9]+/g) || ['INV']).slice(0, 3).map((w) => w[0]).join('').toUpperCase();

// The Indian financial year runs April to March: 22 Oct 2026 is in 26-27, 10 Feb 2027 too.
export function financialYear(d = new Date()) {
  const start = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${String(start).slice(2)}-${String(start + 1).slice(2)}`;
}

// The next number after the highest one already used with this prefix and year.
export function nextInvoiceNumber(name, used, d = new Date()) {
  const stem = `${vendorPrefix(name)}/${financialYear(d)}/`;
  const highest = used.filter((n) => n.startsWith(stem)).reduce((m, n) => Math.max(m, Number(n.slice(stem.length)) || 0), 0);
  return `${stem}${String(highest + 1).padStart(4, '0')}`;
}
