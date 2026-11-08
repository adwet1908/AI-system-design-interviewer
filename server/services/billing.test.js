import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { verifyPaymentSignature } from './paymentProvider.js';
import { isPremiumActive, canAccessProblem } from './entitlements.js';

const SECRET = 'test_secret';
const sign = (orderId, paymentId) =>
  crypto.createHmac('sha256', SECRET).update(`${orderId}|${paymentId}`).digest('hex');

describe('verifyPaymentSignature', () => {
  test('accepts a valid Razorpay signature', () => {
    const signature = sign('order_1', 'pay_1');
    assert.equal(verifyPaymentSignature({ orderId: 'order_1', paymentId: 'pay_1', signature }, SECRET), true);
  });

  test('rejects a signature for a different payment', () => {
    const signature = sign('order_1', 'pay_1');
    assert.equal(verifyPaymentSignature({ orderId: 'order_1', paymentId: 'pay_2', signature }, SECRET), false);
  });

  test('rejects wrong-length and missing signatures', () => {
    assert.equal(verifyPaymentSignature({ orderId: 'o', paymentId: 'p', signature: 'abc' }, SECRET), false);
    assert.equal(verifyPaymentSignature({ orderId: 'o', paymentId: 'p' }, SECRET), false);
    assert.equal(verifyPaymentSignature({ orderId: 'o', paymentId: 'p', signature: sign('o', 'p') }, null), false);
  });
});

describe('entitlements', () => {
  const now = new Date('2026-11-04T00:00:00Z');

  test('isPremiumActive respects expiry', () => {
    assert.equal(isPremiumActive(new Date('2026-11-05T00:00:00Z'), now), true);
    assert.equal(isPremiumActive(new Date('2026-11-03T00:00:00Z'), now), false);
    assert.equal(isPremiumActive(null, now), false);
  });

  test('canAccessProblem: free always, premium only with a pass', () => {
    assert.equal(canAccessProblem({ tier: 'free' }, { isPremium: false }), true);
    assert.equal(canAccessProblem({}, { isPremium: false }), true);
    assert.equal(canAccessProblem({ tier: 'premium' }, { isPremium: false }), false);
    assert.equal(canAccessProblem({ tier: 'premium' }, { isPremium: true }), true);
  });
});
