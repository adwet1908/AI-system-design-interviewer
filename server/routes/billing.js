import { Router } from 'express';
import { Payment } from '../models/Payment.js';
import { getUserId } from '../middleware/requireAuth.js';
import { config, billingEnabled } from '../config.js';
import { rateLimit } from '../lib/rateLimit.js';
import {
  getEntitlement,
  grantPremiumPass,
  reconcilePaidOrders,
} from '../services/entitlements.js';
import { dailyLimitFor, getInterviewUsage } from '../services/usageQuota.js';
import {
  createOrder,
  verifyPaymentSignature,
  PaymentProviderError,
} from '../services/paymentProvider.js';

const router = Router();
const CURRENCY = 'INR';

function requireBilling(_req, res, next) {
  if (!billingEnabled) {
    return res.status(503).json({ error: 'Payments are not configured' });
  }
  next();
}

router.get('/billing/status', async (req, res) => {
  try {
    const userId = getUserId(req);
    await reconcilePaidOrders(userId);
    const entitlement = await getEntitlement(userId);
    const interviews = await getInterviewUsage(
      userId,
      dailyLimitFor(entitlement, {
        freeLimit: config.freeDailyInterviews,
        premiumLimit: config.premiumDailyInterviews,
      })
    );
    res.json({
      ...entitlement,
      billingEnabled,
      // Shown before an interview starts; the session records its own limit.
      sessionMinutes: entitlement.isPremium ? config.premiumSessionMinutes : config.freeSessionMinutes,
      interviews, // today's quota: { limit, used, remaining, resetsAt }
      premiumDailyInterviews: config.premiumDailyInterviews,
      pass: { amount: config.premiumPassPricePaise, currency: CURRENCY, days: config.premiumPassDays },
    });
  } catch (err) {
    console.error('Billing status failed:', err);
    res.status(500).json({ error: 'Failed to load billing status' });
  }
});

router.post('/billing/order', requireBilling, async (req, res) => {
  const userId = getUserId(req);
  const limited = rateLimit({ key: `order:${userId}`, limit: 5, windowMs: 60_000 });
  if (!limited.allowed) {
    return res.status(429).json({ error: 'Too many checkout attempts', retryAfterMs: limited.retryAfterMs });
  }

  try {
    // Amount and duration come from server config only; never from the request.
    const order = await createOrder({
      amount: config.premiumPassPricePaise,
      currency: CURRENCY,
      receipt: `pass_${Date.now()}`,
      notes: { userId, passDays: String(config.premiumPassDays) },
    });

    await Payment.create({
      userId,
      orderId: order.orderId,
      amount: order.amount,
      currency: order.currency,
      passDays: config.premiumPassDays,
    });

    res.status(201).json({
      orderId: order.orderId,
      amount: order.amount,
      currency: order.currency,
      keyId: config.razorpayKeyId,
    });
  } catch (err) {
    console.error('Create order failed:', err);
    const status = err instanceof PaymentProviderError ? 502 : 500;
    res.status(status).json({ error: 'Could not start checkout' });
  }
});

router.post('/billing/verify', requireBilling, async (req, res) => {
  try {
    const userId = getUserId(req);
    const orderId = req.body?.razorpay_order_id;
    const paymentId = req.body?.razorpay_payment_id;
    const signature = req.body?.razorpay_signature;

    const payment = await Payment.findOne({ orderId, userId });
    if (!payment) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (!verifyPaymentSignature({ orderId, paymentId, signature })) {
      return res.status(400).json({ error: 'Payment verification failed' });
    }

    // Record the payment once; a replayed verify leaves the first paymentId in place.
    await Payment.updateOne(
      { _id: payment._id, status: 'created' },
      { $set: { status: 'paid', paymentId, paidAt: new Date() } }
    );

    // Granting is idempotent per order, so a retry after a failure here still
    // grants the pass, and a replay can't extend it twice.
    res.json(await grantPremiumPass(userId, payment.orderId, payment.passDays));
  } catch (err) {
    console.error('Verify payment failed:', err);
    res.status(500).json({ error: 'Failed to verify payment' });
  }
});

export default router;
