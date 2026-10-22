import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../models/index.js';

const r = Router();

// shortcut: in-memory, per-process limiter (resets on restart, not shared across instances); use Redis or express-rate-limit when deployed.
const MAX_FAILS = 10;
const WINDOW_MS = 15 * 60 * 1000;
const fails = new Map(); // "ip email" -> { count, since }; per account so one bad actor can't lock out everyone on a shared IP

r.post('/login', async (req, res) => {
  const now = Date.now();
  const key = `${req.ip} ${String(req.body.email || '').toLowerCase()}`;
  const f = fails.get(key);
  if (f && now - f.since > WINDOW_MS) fails.delete(key);
  else if (f?.count >= MAX_FAILS) return res.status(429).json({ error: 'Too many failed sign-in attempts. Try again in 15 minutes.' });

  const user = await User.findOne({ email: String(req.body.email || '').toLowerCase() });
  if (!user || !(await bcrypt.compare(String(req.body.password || ''), user.passwordHash))) {
    const cur = fails.get(key) ?? { count: 0, since: now };
    fails.set(key, { ...cur, count: cur.count + 1 });
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  fails.delete(key);
  const profile = { id: user._id, name: user.name, role: user.role };
  res.json({ token: jwt.sign(profile, process.env.JWT_SECRET, { expiresIn: '8h' }), user: profile });
});

export default r;
