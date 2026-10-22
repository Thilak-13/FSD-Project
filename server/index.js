import 'dotenv/config';
import mongoose from 'mongoose';
import { app } from './app.js';
import { scheduleReminders } from './jobs/reminders.js';

if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not set (copy .env.example to .env)');

await mongoose.connect(process.env.MONGO_URI);
scheduleReminders();
const port = process.env.PORT || 5050;
app.listen(port, () => console.log(`API on http://localhost:${port}`));
