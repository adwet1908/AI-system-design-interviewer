import crypto from 'node:crypto';
import { config } from '../config.js';

/**
 * Only module that talks to Razorpay. Uses the REST API directly (no SDK);
 * routes and entitlement logic never see vendor details.
 */

const RAZORPAY_API = 'https://api.razorpay.com/v1';

export class PaymentProviderError extends Error {}

export async function createOrder({ amount, currency, receipt, notes }) {
  const auth = Buffer.from(`${config.razorpayKeyId}:${config.razorpayKeySecret}`).toString('base64');
  const res = await fetch(`${RAZORPAY_API}/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ amount, currency, receipt, notes }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new PaymentProviderError(
      data?.error?.description || `Razorpay order creation failed (${res.status})`
    );
  }
  return { orderId: data.id, amount: data.amount, currency: data.currency };
}

/**
 * Razorpay Checkout signature: HMAC-SHA256(order_id + "|" + payment_id, key_secret).
 * This is the only proof of payment we accept; the browser's "success" callback alone is not.
 */
export function verifyPaymentSignature({ orderId, paymentId, signature }, secret = config.razorpayKeySecret) {
  if (!orderId || !paymentId || !signature || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
