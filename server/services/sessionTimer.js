/**
 * Interview time limits. Pure functions, no DB.
 *
 * The clock starts on the session's first turn (startedAt), not at creation, so
 * reading the prompt before clicking Start is free. Sessions created before time
 * limits existed have no timeLimitMinutes and stay unlimited.
 */

const MINUTE_MS = 60_000;

// Turns sent in the last seconds still count: covers network latency and the
// client's auto-end firing slightly after the server's deadline.
export const TIME_UP_GRACE_MS = 15_000;

export function timeLimitFor(entitlement, { freeMinutes, premiumMinutes }) {
  return entitlement?.isPremium ? premiumMinutes : freeMinutes;
}

/**
 * What the client needs to run its countdown. remainingMs (not an absolute
 * deadline) so a wrong clock on the user's machine doesn't skew it.
 * remainingMs is null when there's no limit or the clock hasn't started.
 */
export function sessionTimer(session, now = Date.now()) {
  const limitMinutes = session?.timeLimitMinutes || null;
  if (!limitMinutes || !session.startedAt) {
    return { limitMinutes, remainingMs: null };
  }
  const deadline = new Date(session.startedAt).getTime() + limitMinutes * MINUTE_MS;
  return { limitMinutes, remainingMs: Math.max(0, deadline - now) };
}

export function isPastDeadline(session, now = Date.now(), graceMs = TIME_UP_GRACE_MS) {
  const limitMinutes = session?.timeLimitMinutes;
  if (!limitMinutes || !session.startedAt) return false;
  return now > new Date(session.startedAt).getTime() + limitMinutes * MINUTE_MS + graceMs;
}

/** Whole minutes left for the interviewer prompt, or null when unlimited / not started. */
export function minutesLeft(session, now = Date.now()) {
  const { remainingMs } = sessionTimer(session, now);
  return remainingMs == null ? null : Math.ceil(remainingMs / MINUTE_MS);
}
