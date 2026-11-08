import mongoose from 'mongoose';

// One row per user per quota day: how many interviews they started that day.
// A counter, not a count of Session rows, so deleting a session doesn't hand
// back a slot. Rows delete themselves via the TTL index once the day is over.
const dailyUsageSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  day: { type: String, required: true }, // YYYY-MM-DD in config.quotaTimeZone
  count: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true },
});

// Unique so concurrent first claims of the day can't create two counters.
dailyUsageSchema.index({ userId: 1, day: 1 }, { unique: true });
dailyUsageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const DailyUsage = mongoose.model('DailyUsage', dailyUsageSchema);
