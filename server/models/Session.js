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
      type: {
        nodes: [
          {
            id: { type: String },
            type: { type: String },
            label: { type: String },
          },
        ],
        edges: [
          {
            source: { type: String },
            target: { type: String },
          },
        ],
      },
      default: undefined,
    },
    event: {
      type: {
        type: { type: String, enum: ['phase_advanced', 'curveball'] },
        detail: { type: String },
      },
      default: undefined,
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
      enum: ['active', 'completed'],
      default: 'active',
    },
    messages: { type: [messageSchema], default: [] },
    diagram: {
      nodes: { type: Array, default: [] },
      edges: { type: Array, default: [] },
    },
    evaluation: {
      scores: { type: mongoose.Schema.Types.Mixed, default: {} },
      feedback: { type: String, default: '' },
    },
  },
  { timestamps: true }
);

sessionSchema.index({ userId: 1, createdAt: -1 });

export const Session = mongoose.model('Session', sessionSchema);
export { PHASES };
