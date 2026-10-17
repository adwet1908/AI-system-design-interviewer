import { Router } from 'express';
import { Session } from '../models/Session.js';
import { Problem } from '../models/Problem.js';
import { getUserId } from '../middleware/requireAuth.js';
import { runTurn } from '../services/interviewEngine.js';
import {
  diagramsEqual,
  lastDiagramSnapshot,
  slimDiagram,
} from '../lib/diagram.js';
import { rateLimit } from '../lib/rateLimit.js';

const router = Router();

const MAX_MESSAGE_LEN = 4000;
const MAX_MESSAGES = 60;
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;

async function persistTurn({
  session,
  message,
  diagram,
  phaseAtTurn,
  assistantText,
  phaseAdvanced,
  nextPhaseName,
  advanceReason,
}) {
  const userMsg = {
    role: 'user',
    content: message.trim() ? message : '[Interview start]',
    phase: phaseAtTurn,
    at: new Date(),
  };

  const prevSnap = lastDiagramSnapshot(session.messages);
  if (!prevSnap || !diagramsEqual(prevSnap, diagram)) {
    userMsg.diagramSnapshot = diagram;
  }

  session.messages.push(userMsg);

  const assistantMsg = {
    role: 'assistant',
    content: assistantText || '',
    phase: phaseAtTurn,
    at: new Date(),
  };

  if (phaseAdvanced && nextPhaseName) {
    assistantMsg.event = {
      type: 'phase_advanced',
      detail: `${phaseAtTurn} -> ${nextPhaseName}${
        advanceReason ? `: ${advanceReason}` : ''
      }`,
    };
    // Applies on the next turn's system prompt.
    session.phase = nextPhaseName;
  }

  session.diagram = diagram;
  session.messages.push(assistantMsg);
  await session.save();
}

router.post('/sessions/:id/interview', async (req, res) => {
  const userId = getUserId(req);

  const limited = rateLimit({
    key: `interview:${userId}`,
    limit: RATE_LIMIT,
    windowMs: RATE_WINDOW_MS,
  });
  if (!limited.allowed) {
    return res.status(429).json({
      error: 'Too many interview requests. Please wait a moment.',
      retryAfterMs: limited.retryAfterMs,
    });
  }

  const rawMessage = req.body?.message;
  const message =
    rawMessage === undefined || rawMessage === null ? '' : String(rawMessage);

  if (message.length > MAX_MESSAGE_LEN) {
    return res.status(400).json({
      error: `Message too long (max ${MAX_MESSAGE_LEN} characters)`,
    });
  }

  let session;
  try {
    session = await Session.findOne({ _id: req.params.id, userId });
  } catch (err) {
    console.error('Load session failed:', err);
    return res.status(500).json({ error: 'Failed to load session' });
  }

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  if (session.status !== 'active') {
    return res.status(400).json({ error: 'Session is not active' });
  }

  if (session.messages.length >= MAX_MESSAGES) {
    return res.status(400).json({
      error: `Session turn limit reached (${MAX_MESSAGES} messages). End the interview.`,
    });
  }

  if (!message.trim() && session.messages.length > 0) {
    return res.status(400).json({ error: 'Message cannot be empty' });
  }

  let problem;
  try {
    problem = await Problem.findOne({ slug: session.problemSlug }).lean();
  } catch (err) {
    console.error('Load problem failed:', err);
    return res.status(500).json({ error: 'Failed to load problem' });
  }

  if (!problem) {
    return res.status(404).json({ error: 'Problem not found for session' });
  }

  const diagram = slimDiagram(req.body?.diagram ?? session.diagram);
  const phaseAtTurn = session.phase;

  const abortController = new AbortController();
  const onClose = () => {
    if (!res.writableEnded) abortController.abort();
  };
  req.on('close', onClose);

  let streamedText = '';
  let startedStreaming = false;

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  try {
    const result = await runTurn({
      session: session.toObject(),
      problem,
      userText: message,
      diagram,
      onText: (chunk) => {
        startedStreaming = true;
        streamedText += chunk;
        res.write(chunk);
      },
      options: { signal: abortController.signal },
    });

    const assistantText = result.assistantText || streamedText;

    if (!assistantText && !result.aborted) {
      throw Object.assign(new Error('Empty model response'), {
        beforeStream: !startedStreaming,
      });
    }

    await persistTurn({
      session,
      message,
      diagram,
      phaseAtTurn,
      assistantText,
      phaseAdvanced: Boolean(result.phaseAdvanced) && !result.aborted,
      nextPhaseName: result.nextPhase,
      advanceReason: result.advanceReason,
    });

    if (!res.writableEnded) res.end();
  } catch (err) {
    console.error('Interview turn failed:', err);

    if (startedStreaming && streamedText) {
      try {
        await persistTurn({
          session,
          message,
          diagram,
          phaseAtTurn,
          assistantText: streamedText,
          phaseAdvanced: false,
          nextPhaseName: null,
          advanceReason: null,
        });
      } catch (saveErr) {
        console.error('Failed to save partial interview turn:', saveErr);
      }
      if (!res.writableEnded) res.end();
      return;
    }

    if (!res.headersSent) {
      return res.status(502).json({
        error: 'Interview model call failed',
        detail: err.message,
      });
    }

    if (!res.writableEnded) res.end();
  } finally {
    req.off('close', onClose);
  }
});

export default router;
