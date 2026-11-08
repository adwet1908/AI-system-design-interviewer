import { generateJson } from './llmProvider.js';
import { buildEvaluationPrompt } from '../prompts.js';
import { buildDiagramContext } from './diagramSerializer.js';

export const EVALUATION_CATEGORIES = [
  'requirements',
  'estimation',
  'tradeoffs',
  'bottlenecks',
  'communication',
];

const categoryProperties = Object.fromEntries(
  EVALUATION_CATEGORIES.map((key) => [
    key,
    {
      type: 'object',
      properties: {
        score: { type: 'integer', enum: [1, 2, 3, 4, 5] },
        feedback: { type: 'string' },
      },
      required: ['score', 'feedback'],
      additionalProperties: false,
    },
  ])
);

// Structured outputs require additionalProperties: false on every object.
export const EVALUATION_SCHEMA = {
  type: 'object',
  properties: {
    scores: {
      type: 'object',
      properties: categoryProperties,
      required: EVALUATION_CATEGORIES,
      additionalProperties: false,
    },
    feedback: { type: 'string' },
  },
  required: ['scores', 'feedback'],
  additionalProperties: false,
};

const FALLBACK_EVALUATION = {
  scores: Object.fromEntries(EVALUATION_CATEGORIES.map((key) => [key, null])),
  feedback:
    'Evaluation could not be generated. Your transcript and diagram were saved.',
};

/**
 * Validates and normalizes a parsed evaluation payload.
 * Returns null if the shape is unusable, so the caller can fall back.
 */
export function normalizeEvaluation(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  if (typeof parsed.feedback !== 'string') return null;
  if (!parsed.scores || typeof parsed.scores !== 'object') return null;

  const scores = {};
  for (const category of EVALUATION_CATEGORIES) {
    const entry = parsed.scores[category];
    if (
      !entry ||
      typeof entry.feedback !== 'string' ||
      typeof entry.score !== 'number' ||
      !Number.isInteger(entry.score) ||
      entry.score < 1 ||
      entry.score > 5
    ) {
      return null;
    }
    scores[category] = { score: entry.score, feedback: entry.feedback };
  }

  return { scores, feedback: parsed.feedback };
}

export async function evaluateSession(session, problem) {
  try {
    const diagramContext = buildDiagramContext(session.diagram, null);
    const prompt = buildEvaluationPrompt({
      problem,
      session,
      diagramSummary: diagramContext.summaryText,
      diagramObservations: diagramContext.observationsText,
    });

    const raw = await generateJson({
      systemInstruction: prompt.systemInstruction,
      messages: prompt.messages,
      responseSchema: EVALUATION_SCHEMA,
    });

    const normalized = normalizeEvaluation(JSON.parse(raw));
    if (!normalized) {
      throw new Error('Evaluation response failed shape validation');
    }
    return normalized;
  } catch (err) {
    console.error('Evaluation failed:', err);
    return FALLBACK_EVALUATION;
  }
}
