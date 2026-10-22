import { Router } from 'express';
import { Notification } from '../models/index.js';

const r = Router();
const mine = (u) => ({ $or: [{ user: u.id }, { role: u.role }] });

r.get('/', async (req, res) => {
  const list = await Notification.find(mine(req.user)).sort('-createdAt').limit(50).lean();
  res.json(list.map(({ readBy, ...n }) => ({ ...n, read: readBy.some((id) => String(id) === req.user.id) })));
});

r.post('/read-all', async (req, res) => {
  await Notification.updateMany(mine(req.user), { $addToSet: { readBy: req.user.id } });
  res.status(204).end();
});

export default r;
