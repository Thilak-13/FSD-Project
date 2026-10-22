import express from 'express';
import cors from 'cors';
import { auth, requireRole } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import users from './routes/users.js';
import { vendors, purchaseOrders } from './routes/vendors.js';
import invoices from './routes/invoices.js';
import reports from './routes/reports.js';
import notifications from './routes/notifications.js';
import { runReminders } from './jobs/reminders.js';

export const app = express();
app.use(cors());
app.use(express.json({ limit: '100kb' }));

app.use('/api/auth', authRoutes);
app.use('/api', auth);
app.use('/api/users', users);
app.use('/api/vendors', vendors);
app.use('/api/purchase-orders', purchaseOrders);
app.use('/api/invoices', invoices);
app.use('/api/reports', requireRole('finance', 'manager'), reports);
app.use('/api/notifications', notifications);
app.post('/api/reminders/run', requireRole('admin'), async (req, res) => res.json({ sent: await runReminders() }));

app.use((err, req, res, next) => {
  const status = err.status
    ?? (['ValidationError', 'CastError', 'MulterError'].includes(err.name) ? 400
      : err.name === 'VersionError' ? 409
      : err.code === 11000 ? 409 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Server error' : err.code === 11000 ? 'Already exists' : err.message });
});
