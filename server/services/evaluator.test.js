import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEvaluation, EVALUATION_CATEGORIES } from './evaluator.js';

function validScores(overrides = {}) {
  const scores = {};
  for (const category of EVALUATION_CATEGORIES) {
    scores[category] = { score: 3, feedback: `notes on ${category}` };
  }
  return { ...scores, ...overrides };
}

describe('normalizeEvaluation', () => {
  it('accepts a well-formed payload', () => {
    const result = normalizeEvaluation({
      scores: validScores(),
      feedback: 'overall summary',
    });
    assert.ok(result);
    assert.equal(result.feedback, 'overall summary');
    assert.equal(result.scores.requirements.score, 3);
    assert.equal(result.scores.communication.feedback, 'notes on communication');
  });

  it('rejects a missing category', () => {
    const scores = validScores();
    delete scores.bottlenecks;
    const result = normalizeEvaluation({ scores, feedback: 'summary' });
    assert.equal(result, null);
  });

  it('rejects an out-of-range score', () => {
    const scores = validScores({
      requirements: { score: 7, feedback: 'too high' },
    });
    const result = normalizeEvaluation({ scores, feedback: 'summary' });
    assert.equal(result, null);
  });

  it('rejects a non-integer score', () => {
    const scores = validScores({
      requirements: { score: 3.5, feedback: 'not an int' },
    });
    const result = normalizeEvaluation({ scores, feedback: 'summary' });
    assert.equal(result, null);
  });

  it('rejects a missing top-level feedback string', () => {
    const result = normalizeEvaluation({ scores: validScores() });
    assert.equal(result, null);
  });

  it('rejects null or non-object input', () => {
    assert.equal(normalizeEvaluation(null), null);
    assert.equal(normalizeEvaluation('not an object'), null);
  });
});
