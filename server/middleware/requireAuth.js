import { getAuth } from '@clerk/express';

/**
 * Protect API routes: return 401 JSON when unauthenticated.
 *
 * Uses getAuth() (Clerk's recommended API-route pattern) rather than
 * requireAuth()'s redirect, which is unsuitable for a SPA calling a
 * separate Express origin with Authorization headers.
 *
 * Optional local bypass: set DEV_AUTH_USER_ID to exercise routes without
 * a real Clerk session (never enable in production).
 */
export function requireAuth(req, res, next) {
  if (process.env.DEV_AUTH_USER_ID) {
    req.auth = { userId: process.env.DEV_AUTH_USER_ID };
    return next();
  }

  const auth = getAuth(req);

  if (!auth?.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
}

export function getUserId(req) {
  if (process.env.DEV_AUTH_USER_ID) {
    return process.env.DEV_AUTH_USER_ID;
  }
  return getAuth(req).userId;
}
