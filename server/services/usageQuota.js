import { DailyUsage } from '../models/DailyUsage.js';
import { config } from '../config.js';

/**
 * Daily interview quota (1 a day free, 3 a day premium by default).
 * A slot is claimed when a session is created. Resuming a session is free;
 * deleting one does not refund its slot.
 */

const HOUR_MS = 60 * 60 * 1000;
const DUPLICATE_KEY = 11000;

const formatters = new Map();

/** Calendar day (YYYY-MM-DD) of `date` in `timeZone`. */
export function dayKey(date, timeZone) {
  if (!formatters.has(timeZone)) {
    // en-CA formats dates as YYYY-MM-DD.
    formatters.set(timeZone, new Intl.DateTimeFormat('en-CA', { timeZone }));
  }
  return formatters.get(timeZone).format(date);
}

/**
 * First instant of the next calendar day in `timeZone`, found by binary search
 * on dayKey: correct across DST changes without a timezone library. A day is
 * at most 25h, so the next day has always begun 27h from now.
 */
export function nextDayStart(now, timeZone) {
  const today = dayKey(new Date(now), timeZone);
  let lo = now;
  let hi = now + 27 * HOUR_MS;
  while (hi - lo > 1000) {
    const mid = Math.floor((lo + hi) / 2);
    if (dayKey(new Date(mid), timeZone) === today) lo = mid;
    else hi = mid;
  }
  // Midnight is minute-aligned in every real time zone; hi is within 1s after it.
  return new Date(Math.floor(hi / 60_000) * 60_000);
}

export function dailyLimitFor(entitlement, { freeLimit, premiumLimit }) {
  return entitlement?.isPremium ? premiumLimit : freeLimit;
}

function usage(day, used, limit, now, timeZone) {
  return {
    day,
    limit,
    used,
    remaining: Math.max(0, limit - used),
    resetsAt: nextDayStart(now, timeZone).toISOString(),
  };
}

export async function getInterviewUsage(userId, limit, now = Date.now(), timeZone = config.quotaTimeZone) {
  const day = dayKey(new Date(now), timeZone);
  const row = await DailyUsage.findOne({ userId, day }).select('count').lean();
  return usage(day, row?.count || 0, limit, now, timeZone);
}

/**
 * Atomically take one of today's slots if any are left.
 * The filter only matches while count < limit. When the row exists but is full,
 * the upsert tries to insert a duplicate (userId, day) and fails with E11000,
 * which means "no slots left". The one exception is two first claims of the day
 * racing to insert: the loser retries once, now as a plain increment.
 *
 * @returns usage plus `allowed`
 */
export async function claimInterviewSlot(userId, limit, now = Date.now(), timeZone = config.quotaTimeZone) {
  const day = dayKey(new Date(now), timeZone);
  if (limit <= 0) return { allowed: false, ...usage(day, 0, limit, now, timeZone) };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const row = await DailyUsage.findOneAndUpdate(
        { userId, day, count: { $lt: limit } },
        {
          $inc: { count: 1 },
          // Kept a day past the reset as a safety margin; nothing reads old days.
          $setOnInsert: { expiresAt: new Date(nextDayStart(now, timeZone).getTime() + 24 * HOUR_MS) },
        },
        { upsert: true, new: true }
      ).lean();
      return { allowed: true, ...usage(day, row.count, limit, now, timeZone) };
    } catch (err) {
      if (err?.code !== DUPLICATE_KEY) throw err;
    }
  }
  return { allowed: false, ...(await getInterviewUsage(userId, limit, now, timeZone)) };
}

/** Give a slot back, e.g. when the session it was claimed for failed to save. */
export async function releaseInterviewSlot(userId, day) {
  await DailyUsage.updateOne({ userId, day, count: { $gt: 0 } }, { $inc: { count: -1 } });
}
