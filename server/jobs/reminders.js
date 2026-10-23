import cron from 'node-cron';
import { Invoice, Notification } from '../models/index.js';
import { notify } from '../services/notify.js';
import { DAY, today } from '../services/dates.js';
const UNPAID = ['approved', 'partially_paid', 'pending_approval', 'pending_review'];

export async function runReminders(now = new Date()) {
  const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
  const day = today(now);
  const rules = [
    { type: 'due_soon', targets: [{ role: 'finance' }],
      q: { status: { $in: UNPAID }, dueDate: { $gte: day, $lte: new Date(+day + 3 * DAY) } },
      msg: (i) => `Invoice ${i.invoiceNumber} is due ${i.dueDate.toDateString()}` },
    { type: 'overdue', targets: [{ role: 'finance' }, { role: 'manager' }],
      q: { status: { $in: UNPAID }, dueDate: { $lt: day } },
      msg: (i) => `Invoice ${i.invoiceNumber} is ${Math.round((day - i.dueDate) / DAY)} day(s) overdue` },
    { type: 'review_stale', targets: [{ role: 'finance' }],
      q: { status: 'pending_review', submittedAt: { $lt: new Date(+now - 2 * DAY) } },
      msg: (i) => `Invoice ${i.invoiceNumber} has waited over 2 days for finance review` },
    // The approval clock starts when finance forwards it; older invoices without a review step use submittedAt.
    { type: 'approval_stale', targets: [{ role: 'manager' }],
      q: { status: 'pending_approval', $or: [{ reviewedAt: { $lt: new Date(+now - 2 * DAY) } }, { reviewedAt: null, submittedAt: { $lt: new Date(+now - 2 * DAY) } }] },
      msg: (i) => `Invoice ${i.invoiceNumber} has waited over 2 days for approval` },
  ];

  let sent = 0;
  for (const rule of rules) {
    for (const inv of await Invoice.find(rule.q)) {
      if (await Notification.exists({ invoice: inv._id, type: rule.type, createdAt: { $gte: startOfDay } })) continue;
      await notify(rule.targets, { invoice: inv._id, type: rule.type, message: rule.msg(inv) });
      sent++;
    }
  }
  return sent;
}

export const scheduleReminders = () =>
  cron.schedule('0 9 * * *', () => runReminders().catch((e) => console.error('Reminder job failed', e)));
