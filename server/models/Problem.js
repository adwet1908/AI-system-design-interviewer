import mongoose from 'mongoose';

const problemSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, trim: true },
    title: { type: String, required: true, trim: true },
    difficulty: {
      type: String,
      required: true,
      enum: ['easy', 'medium', 'hard'],
    },
    prompt: { type: String, required: true },
    hiddenRequirements: { type: [String], default: [] },
    keyTopics: { type: [String], default: [] },
    commonPitfalls: { type: [String], default: [] },
    curveballs: { type: [String], default: [] },
  },
  { timestamps: true }
);

export const Problem = mongoose.model('Problem', problemSchema);
