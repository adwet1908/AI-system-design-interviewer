import { Session } from '../models/Session.js';
import { Problem } from '../models/Problem.js';
import { evaluateSession } from './evaluator.js';

/**
 * Background scoring (D-030). /end only claims the session (active -> evaluating)
 * and returns; this module runs the slow evaluator call and writes the result.
 *
 * Every write is conditional on status 'evaluating', so a session deleted or
 * already scored meanwhile is left alone. State lives in Mongo, not memory, so a
 * restart can't lose a job for good: see claimStaleEvaluation.
 */

// Longer than any normal evaluator call; after this an 'evaluating' session is
// assumed orphaned (server restarted mid-job) and may be claimed again.
export const STALE_EVALUATION_MS = 5 * 60_000;

const FAILURE_MESSAGE = 'Scoring failed. Your transcript and diagram are saved; try scoring again.';

export async function runEvaluation(sessionId) {
  const session = await Session.findById(sessionId).lean();
  if (!session || session.status !== 'evaluating') return;

  try {
    const problem = await Problem.findOne({ slug: session.problemSlug }).lean();
    if (!problem) throw new Error(`Problem not found: ${session.problemSlug}`);
    const evaluation = await evaluateSession(session, problem);
    await Session.updateOne(
      { _id: sessionId, status: 'evaluating' },
      { $set: { status: 'completed', evaluation, evaluationError: null } }
    );
  } catch (err) {
    console.error(`Evaluation failed for session ${sessionId}:`, err);
    await Session.updateOne(
      { _id: sessionId, status: 'evaluating' },
      { $set: { status: 'completed', evaluationError: FAILURE_MESSAGE } }
    );
  }
}

/** Fire and forget: the HTTP response has already been sent. */
export function startEvaluation(sessionId) {
  runEvaluation(sessionId).catch((err) => {
    console.error(`Evaluation job crashed for session ${sessionId}:`, err);
  });
}

/**
 * Re-claim a job orphaned by a restart. The filter on evaluationStartedAt makes
 * it atomic: of several requests that notice the same stale job, one restarts it.
 * @returns the updated session if this caller claimed it, else null
 */
export async function claimStaleEvaluation(sessionId, userId, now = new Date()) {
  return Session.findOneAndUpdate(
    {
      _id: sessionId,
      userId,
      status: 'evaluating',
      evaluationStartedAt: { $lt: new Date(now.getTime() - STALE_EVALUATION_MS) },
    },
    { $set: { evaluationStartedAt: now } },
    { new: true }
  ).lean();
}
