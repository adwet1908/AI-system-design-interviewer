import mongoose from 'mongoose';

// One row per Razorpay order. status flips created -> paid exactly once, which is
// what makes granting a pass idempotent (a replayed verify call can't extend twice).
const paymentSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    orderId: { type: String, required: true, unique: true },
    paymentId: { type: String, default: null },
    amount: { type: Number, required: true }, // paise
    currency: { type: String, required: true },
    passDays: { type: Number, required: true },
    status: { type: String, enum: ['created', 'paid'], default: 'created' },
    paidAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export const Payment = mongoose.model('Payment', paymentSchema);
