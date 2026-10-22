import { Router } from 'express';
import { Invoice } from '../models/index.js';
import { OPEN } from './invoices.js';

const r = Router();
import { DAY, today } from '../services/dates.js';
const paidExpr = { $sum: '$payments.amount' };
const daysBetween = (a, b) => ({ $divide: [{ $subtract: [b, a] }, DAY] });

function dateRange({ from, to }) {
  const q = {};
  if (from) q.$gte = new Date(from);
  if (to) q.$lte = new Date(`${to}T23:59:59.999`);
  if (Object.values(q).some((d) => isNaN(d))) throw Object.assign(new Error('Dates must be in YYYY-MM-DD format'), { status: 400 });
  return from || to ? { invoiceDate: q } : {};
}

r.get('/kpis', async (req, res) => {
  const now = new Date();
  const day = today(now);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const [pendingApproval, overdue, dueThisWeek, [paid = { total: 0 }]] = await Promise.all([
    Invoice.countDocuments({ status: 'pending_approval' }),
    Invoice.countDocuments({ status: { $in: OPEN }, dueDate: { $lt: day } }),
    Invoice.countDocuments({ status: { $in: OPEN }, dueDate: { $gte: day, $lte: new Date(+day + 7 * DAY) } }),
    Invoice.aggregate([{ $unwind: '$payments' }, { $match: { 'payments.date': { $gte: monthStart } } },
      { $group: { _id: null, total: { $sum: '$payments.amount' } } }]),
  ]);
  res.json({ pendingApproval, overdue, dueThisWeek, paidThisMonth: paid.total });
});

r.get('/summary', async (req, res) => {
  const now = new Date();
  const [s] = await Invoice.aggregate([
    { $match: dateRange(req.query) },
    { $addFields: { paid: paidExpr } },
    { $facet: {
      byStatus: [{ $group: { _id: '$status', count: { $sum: 1 }, amount: { $sum: '$amount' } } }, { $sort: { _id: 1 } }],
      totals: [
        { $match: { status: { $in: [...OPEN, 'paid'] } } },
        { $group: { _id: null, paid: { $sum: '$paid' }, outstanding: { $sum: { $subtract: ['$amount', '$paid'] } } } },
      ],
      aging: [
        { $match: { status: { $in: OPEN } } },
        { $addFields: { late: daysBetween('$dueDate', today(now)) } },
        { $bucket: { groupBy: '$late', boundaries: [-Infinity, 0, 31, 61, 91, Infinity], default: 'n/a',
          output: { count: { $sum: 1 }, amount: { $sum: { $subtract: ['$amount', '$paid'] } } } } },
      ],
      topVendors: [
        { $match: { paid: { $gt: 0 } } },
        { $group: { _id: '$vendor', paid: { $sum: '$paid' } } }, { $sort: { paid: -1 } }, { $limit: 5 },
        { $lookup: { from: 'vendors', localField: '_id', foreignField: '_id', as: 'v' } },
        { $project: { name: { $first: '$v.name' }, paid: 1 } },
      ],
      monthly: [
        { $unwind: '$payments' },
        { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$payments.date' } }, paid: { $sum: '$payments.amount' } } },
        { $sort: { _id: 1 } },
      ],
      cycle: [{ $group: { _id: null,
        toApproval: { $avg: { $cond: ['$approvedAt', daysBetween('$submittedAt', '$approvedAt'), null] } },
        toPayment: { $avg: { $cond: ['$paidAt', daysBetween('$approvedAt', '$paidAt'), null] } } } }],
      owedByVendor: [
        { $match: { status: { $in: OPEN } } },
        { $addFields: { balance: { $subtract: ['$amount', '$paid'] }, late: { $lt: ['$dueDate', today(now)] } } },
        { $group: { _id: '$vendor', invoices: { $sum: 1 },
          notDue: { $sum: { $cond: ['$late', 0, '$balance'] } }, overdue: { $sum: { $cond: ['$late', '$balance', 0] } } } },
        { $sort: { overdue: -1, notDue: -1 } },
        { $lookup: { from: 'vendors', localField: '_id', foreignField: '_id', as: 'v' } },
        { $project: { name: { $first: '$v.name' }, invoices: 1, notDue: 1, overdue: 1 } },
      ],
      awaitingApproval: [
        { $match: { status: 'pending_approval' } },
        { $sort: { submittedAt: 1 } },
        { $lookup: { from: 'vendors', localField: 'vendor', foreignField: '_id', as: 'v' } },
        { $project: { invoiceNumber: 1, amount: 1, submittedAt: 1, vendor: { $first: '$v.name' }, waitingDays: daysBetween('$submittedAt', now) } },
      ],
      onTime: [
        { $match: { status: 'paid' } },
        // On time = final payment made on or before the due date (any time that day).
        { $group: { _id: null, paid: { $sum: 1 },
          onTime: { $sum: { $cond: [{ $lt: [{ $max: '$payments.date' }, { $add: ['$dueDate', DAY] }] }, 1, 0] } } } },
      ],
    } },
  ]);
  const labels = { '-Infinity': 'Not yet due', 0: '0-30', 31: '31-60', 61: '61-90', 91: '90+' };
  res.json({
    byStatus: s.byStatus,
    totals: s.totals[0] ?? { paid: 0, outstanding: 0 },
    aging: s.aging.map((b) => ({ bucket: labels[b._id], count: b.count, amount: b.amount })),
    topVendors: s.topVendors,
    monthly: s.monthly,
    cycle: s.cycle[0] ?? {},
    owedByVendor: s.owedByVendor,
    awaitingApproval: s.awaitingApproval,
    onTime: s.onTime[0] ?? { paid: 0, onTime: 0 },
  });
});

const csvCell = (v) => {
  const s = v == null ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
  // Quote everything; leading = + - @ is neutralised so spreadsheets don't run it as a formula.
  return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
};

r.get('/invoices.csv', async (req, res) => {
  const rows = await Invoice.find(dateRange(req.query)).populate('vendor', 'name').sort('invoiceDate').lean();
  const header = ['Invoice', 'Vendor', 'Invoice date', 'Due date', 'Amount', 'Paid', 'Status'];
  const lines = rows.map((i) => [i.invoiceNumber, i.vendor?.name, i.invoiceDate, i.dueDate, i.amount,
    i.payments.reduce((s, p) => s + p.amount, 0), i.status].map(csvCell).join(','));
  res.type('text/csv').attachment('invoices.csv').send([header.map(csvCell).join(','), ...lines].join('\n'));
});

export default r;
