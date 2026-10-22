import jwt from 'jsonwebtoken';
import { User } from '../models/index.js';

// Verifies the token, then reloads the user so deleted users and role changes take effect immediately.
export async function auth(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer /, '');
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const user = await User.findById(payload.id).select('name role').lean();
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  req.user = { id: String(user._id), name: user.name, role: user.role };
  next();
}

// Admin can do everything.
export const requireRole = (...roles) => (req, res, next) =>
  req.user.role === 'admin' || roles.includes(req.user.role)
    ? next()
    : res.status(403).json({ error: 'Forbidden' });
