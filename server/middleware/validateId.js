import mongoose from 'mongoose';

/**
 * router.param handler for :id. A malformed id can't match any session, so it's
 * a 404 like any other missing session, rather than a Mongoose CastError (500).
 */
export function validateSessionId(_req, res, next, id) {
  if (!mongoose.isValidObjectId(id)) {
    return res.status(404).json({ error: 'Session not found' });
  }
  next();
}
