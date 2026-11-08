import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { dayKey, nextDayStart, dailyLimitFor } from './usageQuota.js';

const IST = 'Asia/Kolkata';

describe('dayKey', () => {
  test('uses the configured time zone, not UTC', () => {
    // 20:00 UTC is 01:30 the next day in India.
    assert.equal(dayKey(new Date('2026-11-08T20:00:00Z'), 'UTC'), '2026-11-08');
    assert.equal(dayKey(new Date('2026-11-08T20:00:00Z'), IST), '2026-11-09');
  });
});

describe('nextDayStart', () => {
  test('finds the next IST midnight', () => {
    const now = Date.parse('2026-11-08T10:00:00Z'); // 15:30 IST
    assert.equal(nextDayStart(now, IST).toISOString(), '2026-11-08T18:30:00.000Z');
  });

  test('just before midnight resets a minute later', () => {
    const now = Date.parse('2026-11-08T18:29:00Z'); // 23:59 IST
    assert.equal(nextDayStart(now, IST).toISOString(), '2026-11-08T18:30:00.000Z');
  });

  test('handles a DST change (23-hour day in New York)', () => {
    // 2026-03-08 is the spring-forward day in America/New_York.
    const now = Date.parse('2026-03-08T12:00:00Z');
    assert.equal(nextDayStart(now, 'America/New_York').toISOString(), '2026-03-09T04:00:00.000Z');
  });
});

describe('dailyLimitFor', () => {
  const limits = { freeLimit: 1, premiumLimit: 3 };

  test('free users get 1', () => {
    assert.equal(dailyLimitFor({ isPremium: false }, limits), 1);
    assert.equal(dailyLimitFor(null, limits), 1);
  });

  test('premium users get 3', () => {
    assert.equal(dailyLimitFor({ isPremium: true }, limits), 3);
  });
});
