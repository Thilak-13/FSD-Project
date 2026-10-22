import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { User } from '../models/index.js';
import { requireRole } from '../middleware/auth.js';

const r = Router();
r.use(requireRole('admin'));

r.get('/', async (req, res) => res.json(await User.find().select('-passwordHash').sort('name')));

r.post('/', async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  const user = await User.create({ name, email, role, passwordHash: await bcrypt.hash(password, 10) });
  res.status(201).json({ _id: user._id, name, email: user.email, role });
});

r.delete('/:id', async (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'You cannot delete yourself' });
  await User.findByIdAndDelete(req.params.id);
  res.status(204).end();
});

export default r;
