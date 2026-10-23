const DAY = 86400000;

export const money = (n) => (n ?? 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2, minimumFractionDigits: 0 });
export const date = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const paidOf = (inv) => inv.payments?.reduce((s, p) => s + p.amount, 0) ?? 0;
export const balanceOf = (inv) => Math.round((inv.amount - paidOf(inv)) * 100) / 100;
// Due dates are stored as UTC midnight of a calendar day; compare against today's calendar day, not this instant.
const todayUTC = () => { const n = new Date(); return Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()); };
export const isOverdue = (inv) => ['pending_approval', 'approved', 'partially_paid'].includes(inv.status) && new Date(inv.dueDate) < todayUTC();
export const daysSince = (d) => Math.floor((Date.now() - new Date(d)) / DAY);
export const daysUntil = (d) => Math.round((new Date(d) - todayUTC()) / DAY);

// Plain-English names for each status, used everywhere the user sees a status.
export const STATUS = {
  submitted: { label: 'Checking', tone: 'neutral' },
  verification_failed: { label: 'Needs fixing', tone: 'bad' },
  pending_review: { label: 'Finance review', tone: 'wait' },
  returned: { label: 'Returned to vendor', tone: 'bad' },
  pending_approval: { label: 'Waiting for approval', tone: 'wait' },
  rejected: { label: 'Rejected', tone: 'bad' },
  approved: { label: 'Ready to pay', tone: 'pay' },
  partially_paid: { label: 'Partly paid', tone: 'pay' },
  paid: { label: 'Paid', tone: 'ok' },
};

// The payment route: the order an invoice moves through.
export const ROUTE = ['verification_failed', 'pending_review', 'pending_approval', 'approved', 'partially_paid', 'paid'];
// Back with the vendor to correct and resubmit.
export const WITH_VENDOR = ['verification_failed', 'returned', 'rejected'];

export const dueText = (inv) => {
  if (inv.status === 'paid') return `Paid ${date(inv.paidAt)}`;
  const d = daysUntil(inv.dueDate);
  if (!isOverdue(inv)) return d === 0 ? 'Due today' : d > 0 ? `Due in ${d} day${d === 1 ? '' : 's'}` : `Was due ${date(inv.dueDate)}`;
  return `${-d} day${d === -1 ? '' : 's'} overdue`;
};
