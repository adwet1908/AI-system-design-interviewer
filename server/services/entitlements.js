import { User } from '../models/User.js';
import { Payment } from '../models/Payment.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const DUPLICATE_KEY = 11000;

export function isPremiumActive(premiumUntil, now = new Date()) {
  return Boolean(premiumUntil && premiumUntil > now);
}

export function canAccessProblem(problem, entitlement) {
  return (problem?.tier || 'free') === 'free' || Boolean(entitlement?.isPremium);
}

/**
 * Mongo update pipeline: a new pass stacks on top of an unexpired one, otherwise
 * starts now, and the order is recorded as applied. Runs atomically on the server,
 * so concurrent grants for different orders can't overwrite each other.
 */
export function premiumPassUpdate(orderId, days) {
  return [
    {
      $set: {
        premiumUntil: {
          $add: [
            { $max: ['$$NOW', { $ifNull: ['$premiumUntil', '$$NOW'] }] },
            days * DAY_MS,
          ],
        },
        appliedOrderIds: {
          $concatArrays: [{ $ifNull: ['$appliedOrderIds', []] }, [orderId]],
        },
      },
    },
  ];
}

export async function getEntitlement(userId) {
  const user = await User.findOne({ userId }).select('premiumUntil').lean();
  const premiumUntil = user?.premiumUntil || null;
  return { isPremium: isPremiumActive(premiumUntil), premiumUntil };
}

/**
 * Idempotent per order: adds `days` to the user's pass unless this order was already
 * applied. Safe to call again after a crash or a replayed verify.
 */
export async function grantPremiumPass(userId, orderId, days) {
  const filter = { userId, appliedOrderIds: { $ne: orderId } };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await User.updateOne(filter, premiumPassUpdate(orderId, days), { upsert: true });
      break;
    } catch (err) {
      // Upsert hit an existing user: either the order is already applied (done), or a
      // concurrent first-time insert won the race (retry once as a plain update).
      if (err?.code !== DUPLICATE_KEY) throw err;
      const applied = await User.exists({ userId, appliedOrderIds: orderId });
      if (applied) break;
    }
  }
  return getEntitlement(userId);
}

/**
 * Apply any of this user's paid orders that never reached their User record
 * (e.g. the server died between marking the payment paid and granting the pass).
 */
export async function reconcilePaidOrders(userId) {
  const [paid, user] = await Promise.all([
    Payment.find({ userId, status: 'paid' }).select('orderId passDays').lean(),
    User.findOne({ userId }).select('appliedOrderIds').lean(),
  ]);
  const applied = new Set(user?.appliedOrderIds || []);
  for (const payment of paid) {
    if (!applied.has(payment.orderId)) {
      await grantPremiumPass(userId, payment.orderId, payment.passDays);
    }
  }
}
