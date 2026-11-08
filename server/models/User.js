import mongoose from 'mongoose';

// Per-user entitlement record, keyed by Clerk user id. Created lazily on first purchase.
// appliedOrderIds makes granting idempotent per order: a pass is added at most once
// per Razorpay order, so verify/reconcile can be retried safely after a crash.
const userSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true },
    premiumUntil: { type: Date, default: null },
    appliedOrderIds: { type: [String], default: [] },
  },
  { timestamps: true }
);

export const User = mongoose.model('User', userSchema);
