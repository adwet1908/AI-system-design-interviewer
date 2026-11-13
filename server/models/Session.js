import mongoose from 'mongoose';

const PHASES = [
  'requirements',
  'estimation',
  'high_level',
  'deep_dive',
  'scale',
  'wrapup',
];

const messageSchema = new mongoose.Schema(
  {
    role: { type: String, required: true, enum: ['user', 'assistant'] },
    content: { type: String, required: true },
    phase: { type: String, enum: PHASES, required: true },
    diagramSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      required: false,
    },
    event: {
      type: mongoose.Schema.Types.Mixed,
      required: false,
    },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const sessionSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    problemSlug: { type: String, required: true },
    phase: {
      type: String,
      enum: PHASES,
      default: 'requirements',
    },
    status: {
      type: String,
      // evaluating: ended, background scoring in progress (D-030).
      enum: ['active', 'evaluating', 'completed'],
      default: 'active',
    },
    // Set at creation from the user's tier; null on sessions from before limits.
    timeLimitMinutes: { type: Number, default: null },
    // When the first turn started; the time limit counts from here.
    startedAt: { type: Date, default: null },
    messages: { type: [messageSchema], default: [] },
    diagram: {
      nodes: { type: Array, default: [] },
      edges: { type: Array, default: [] },
    },
    evaluation: {
      scores: { type: mongoose.Schema.Types.Mixed, default: {} },
      feedback: { type: String, default: '' },
    },
    // When the current scoring run was claimed; used to detect orphaned jobs.
    evaluationStartedAt: { type: Date, default: null },
    // Set when scoring failed; the session is completed but can be re-scored.
    evaluationError: { type: String, default: null },
  },
  { timestamps: true }
);

sessionSchema.index({ userId: 1, createdAt: -1 });

export const Session = mongoose.model('Session', sessionSchema);
export { PHASES };
