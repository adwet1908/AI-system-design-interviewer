import express from 'express';
import cors from 'cors';
import { clerkMiddleware } from '@clerk/express';
import { config } from './config.js';
import { connectDb } from './db.js';
import { requireAuth, getUserId } from './middleware/requireAuth.js';

const app = express();

app.use(
  cors({
    origin: config.clientOrigin,
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(clerkMiddleware());

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api', requireAuth);

app.get('/api/me', (req, res) => {
  res.json({ userId: getUserId(req) });
});

await connectDb();

app.listen(config.port, () => {
  console.log(`Server listening on http://localhost:${config.port}`);
});
