import { getAuth } from '@clerk/express';

/**
 * Protect API routes: return 401 JSON when unauthenticated.
 * Uses getAuth() (Clerk's recommended API-route pattern) rather than
 * requireAuth()'s redirect, which is unsuitable for a SPA calling a
 * separate Express origin with Authorization headers.
 */
export function requireAuth(req, res, next) {
  const auth = getAuth(req);

  if (!auth?.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
}

export function getUserId(req) {
  return getAuth(req).userId;
}
