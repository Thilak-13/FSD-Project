import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { User, Vendor } from '../models/index.js';

// The accounts an admin looks after. Admin accounts themselves are created by the seed, not from the app.
const MANAGED = ['vendor', 'finance', 'manager'];
// A vendor login must belong to a real vendor; other roles never carry one.
async function vendorFor(role, id) {
  if (role !== 'vendor') return null;
  const v = await Vendor.findById(id).select('_id').lean().catch(() => null);
  if (!v) throw Object.assign(new Error('Choose which vendor this login belongs to'), { status: 400 });
  return v._id;
}
import { requireRole } from '../middleware/auth.js';

const r = Router();
r.use(requireRole('admin'));

r.get('/', async (req, res) => res.json(await User.find().select('-passwordHash').populate('vendor', 'name').sort('name')));

r.post('/', async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!MANAGED.includes(role)) return res.status(400).json({ error: 'Role must be vendor, finance or manager' });
  if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  const vendor = await vendorFor(role, req.body.vendor);
  const user = await User.create({ name, email, role, vendor, passwordHash: await bcrypt.hash(password, 10) });
  res.status(201).json({ _id: user._id, name, email: user.email, role, vendor: user.vendor });
});

// Change someone's role (and vendor) or set a new temporary password.
r.patch('/:id', async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  if (!MANAGED.includes(user.role)) return res.status(403).json({ error: 'Admin accounts cannot be changed here' });
  const { role, password } = req.body;
  if (role !== undefined) {
    if (!MANAGED.includes(role)) return res.status(400).json({ error: 'Role must be vendor, finance or manager' });
    user.vendor = (await vendorFor(role, req.body.vendor)) ?? undefined;
    user.role = role;
  }
  if (password !== undefined) {
    if (String(password).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    user.passwordHash = await bcrypt.hash(String(password), 10);
  }
  await user.save();
  res.json({ _id: user._id, name: user.name, email: user.email, role: user.role, vendor: user.vendor });
});

r.delete('/:id', async (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'You cannot delete yourself' });
  const user = await User.findById(req.params.id).select('role').lean();
  if (user && !MANAGED.includes(user.role)) return res.status(403).json({ error: 'Admin accounts cannot be removed here' });
  await User.findByIdAndDelete(req.params.id);
  res.status(204).end();
});

export default r;
