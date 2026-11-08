import express from 'express';
import cors from 'cors';
import { clerkMiddleware } from '@clerk/express';
import { config } from './config.js';
import { connectDb } from './db.js';
import { requireAuth, getUserId } from './middleware/requireAuth.js';
import sessionsRouter from './routes/sessions.js';
import interviewRouter from './routes/interview.js';
import billingRouter from './routes/billing.js';

const app = express();
const devAuth = Boolean(process.env.DEV_AUTH_USER_ID);

app.use(
  cors({
    origin: config.clientOrigin,
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

await connectDb();

app.listen(config.port, () => {
  console.log(
    `Server listening on http://localhost:${config.port}` +
      (devAuth ? ' (DEV_AUTH_USER_ID bypass active)' : '')
  );
});
