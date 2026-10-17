/**
 * Stub evaluator. Full rubric scoring lands in a later milestone.
 */
export async function evaluateSession(_session, _problem) {
  return {
    scores: {
      requirements: null,
      estimation: null,
      tradeoffs: null,
      bottlenecks: null,
      communication: null,
    },
    feedback:
      'Evaluation is not implemented yet. Your transcript and diagram were saved.',
  };
}
