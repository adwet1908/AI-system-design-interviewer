import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  timeLimitFor,
  sessionTimer,
  isPastDeadline,
  minutesLeft,
  TIME_UP_GRACE_MS,
} from './sessionTimer.js';

const LIMITS = { freeMinutes: 15, premiumMinutes: 30 };
const START = new Date('2026-11-08T10:00:00Z');
const at = (minutes) => START.getTime() + minutes * 60_000;

describe('timeLimitFor', () => {
  test('free users get the free limit', () => {
    assert.equal(timeLimitFor({ isPremium: false }, LIMITS), 15);
    assert.equal(timeLimitFor(null, LIMITS), 15);
  });

  test('premium users get the premium limit', () => {
    assert.equal(timeLimitFor({ isPremium: true }, LIMITS), 30);
  });
});

describe('sessionTimer', () => {
  test('clock has not started before the first turn', () => {
    assert.deepEqual(sessionTimer({ timeLimitMinutes: 15 }, at(5)), {
      limitMinutes: 15,
      remainingMs: null,
    });
  });

  test('counts down from startedAt', () => {
    const session = { timeLimitMinutes: 15, startedAt: START };
    assert.equal(sessionTimer(session, at(10)).remainingMs, 5 * 60_000);
  });

  test('never goes negative', () => {
    const session = { timeLimitMinutes: 15, startedAt: START };
    assert.equal(sessionTimer(session, at(20)).remainingMs, 0);
  });

  test('legacy sessions without a limit are unlimited', () => {
    const session = { startedAt: START };
    assert.deepEqual(sessionTimer(session, at(500)), { limitMinutes: null, remainingMs: null });
    assert.equal(isPastDeadline(session, at(500)), false);
  });
});

describe('isPastDeadline', () => {
  const session = { timeLimitMinutes: 15, startedAt: START };

  test('allows turns inside the grace window', () => {
    assert.equal(isPastDeadline(session, at(15) + TIME_UP_GRACE_MS), false);
  });

  test('rejects turns after the grace window', () => {
    assert.equal(isPastDeadline(session, at(15) + TIME_UP_GRACE_MS + 1), true);
  });

  test('a session that never started is never past its deadline', () => {
    assert.equal(isPastDeadline({ timeLimitMinutes: 15 }, at(500)), false);
  });
});

describe('minutesLeft', () => {
  test('rounds up partial minutes', () => {
    const session = { timeLimitMinutes: 15, startedAt: START };
    assert.equal(minutesLeft(session, at(12.5)), 3);
  });
});
