import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { clerkMiddleware } from '@clerk/express';
import { config } from './config.js';
import { connectDb } from './db.js';
import { requireAuth, getUserId } from './middleware/requireAuth.js';
import sessionsRouter from './routes/sessions.js';
import interviewRouter from './routes/interview.js';
import billingRouter from './routes/billing.js';

const app = express();
const devAuth = Boolean(process.env.DEV_AUTH_USER_ID);

app.use(helmet());
app.use(
  cors({
    origin: config.clientOrigins,
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

// Skip Clerk JWT parsing when using the local DEV_AUTH_USER_ID bypass.
if (!devAuth) {
  app.use(clerkMiddleware());
}

app.use('/api', requireAuth);

app.get('/api/me', (req, res) => {
  res.json({ userId: getUserId(req) });
});

app.use('/api', sessionsRouter);
app.use('/api', interviewRouter);
app.use('/api', billingRouter);

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Last-resort handler: JSON instead of Express's HTML page, and no stack traces
// or internal messages for 5xx. Client errors (e.g. malformed JSON body, 400)
// keep their status and Express's safe message.
app.use((err, _req, res, next) => {
  if (res.headersSent) return next(err);
  const status = Number(err.status || err.statusCode) || 500;
  if (status >= 500) {
    console.error('Unhandled error:', err);
    return res.status(status).json({ error: 'Internal server error' });
  }
  res.status(status).json({ error: err.expose ? err.message : 'Bad request' });
});

await connectDb();

app.listen(config.port, () => {
  console.log(
    `Server listening on http://localhost:${config.port}` +
      (devAuth ? ' (DEV_AUTH_USER_ID bypass active)' : '')
  );
});
