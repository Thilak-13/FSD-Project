import { Notification } from '../models/index.js';

export const notify = (targets, { invoice, type, message }) =>
  Notification.insertMany(targets.map((t) => ({ ...t, invoice, type, message })));
