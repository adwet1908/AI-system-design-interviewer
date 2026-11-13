import { Router } from 'express';
import { Session } from '../models/Session.js';
import { Problem } from '../models/Problem.js';
import { getUserId } from '../middleware/requireAuth.js';
import { runTurn } from '../services/interviewEngine.js';
import {
  buildDiagramContext,
  DiagramValidationError,
} from '../services/diagramSerializer.js';
import { diagramsEqual, lastDiagramSnapshot } from '../lib/diagram.js';
import { rateLimit } from '../lib/rateLimit.js';
import { isPastDeadline, minutesLeft } from '../services/sessionTimer.js';
import { validateSessionId } from '../middleware/validateId.js';

const router = Router();
router.param('id', validateSessionId);

const MAX_MESSAGE_LEN = 4000;
const MAX_MESSAGES = 60;
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;

/**
 * Append the user message and the assistant reply in one save.
 * The user message is stored only after the model answers: a failed call leaves
 * history untouched, so the candidate can just resend.
 * The diagram snapshot rides on the user message, and only when it changed since
 * the last one, to keep the transcript small (see lastDiagramSnapshot).
 * A phase advance is recorded on the reply that triggered it and takes effect
 * from the next turn's system prompt.
 */
async function persistTurn({
  session,
  message,
  persistedDiagram,
  slimJson,
  phaseAtTurn,
  turnStartedAt,
  assistantText,
  phaseAdvanced,
  nextPhaseName,
  advanceReason,
}) {

  const userMsg = {
    role: 'user',
    // The opening turn has no user text. A placeholder keeps history alternating
    // user/assistant (the API requires a user message first); the UI renders it
    // as a divider.
    content: message.trim() ? message : '[Interview start]',
    phase: phaseAtTurn,
    at: new Date(),
  };

  const prevSnap = lastDiagramSnapshot(session.messages);
  if (!prevSnap || !diagramsEqual(prevSnap, slimJson)) {
    userMsg.diagramSnapshot = slimJson;
  }

  const assistantMsg = {
    role: 'assistant',
    content: assistantText || '',
    phase: phaseAtTurn,
    at: new Date(),
  };

  const set = { diagram: persistedDiagram };
  if (phaseAdvanced && nextPhaseName) {
    assistantMsg.event = {
      type: 'phase_advanced',
      detail: `${phaseAtTurn} -> ${nextPhaseName}${
        advanceReason ? `: ${advanceReason}` : ''
      }`,
    };
    set.phase = nextPhaseName;
  }
  // The time limit counts from the first turn, not from session creation.
  if (!session.startedAt) set.startedAt = turnStartedAt;

  // Conditional on still being active: if the interview was ended while this
  // reply streamed, the turn is dropped instead of landing after the score.
  // (session.save() would write unconditionally.)
  const result = await Session.updateOne(
    { _id: session._id, status: 'active' },
    { $push: { messages: { $each: [userMsg, assistantMsg] } }, $set: set }
  );
  if (result.matchedCount === 0) {
    console.warn(`Turn for session ${session._id} dropped: session no longer active`);
  }
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

  // Server-side enforcement: the client auto-ends at the limit, but a modified
  // client must not be able to keep the (paid-for) model talking.
  const turnStartedAt = new Date();
  if (isPastDeadline(session, turnStartedAt.getTime())) {
    return res.status(409).json({
      error: 'Time is up for this interview. End it to see your score.',
      code: 'time_up',
    });
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

  let diagramContext;
  try {
    const previousSnapshot = lastDiagramSnapshot(session.messages);
    diagramContext = buildDiagramContext(
      req.body?.diagram ?? session.diagram,
      previousSnapshot
    );
  } catch (err) {
    if (err instanceof DiagramValidationError) {
      return res.status(400).json({ error: err.message });
    }
    throw err;
  }

  const { slimJson, promptBlock, persistedDiagram } = diagramContext;
  const phaseAtTurn = session.phase;

  // If the browser goes away (Stop button, tab closed), abort the model call so we
  // stop paying for tokens nobody will read. writableEnded guards against the
  // 'close' that fires after a normal finish.
  const abortController = new AbortController();
  const onClose = () => {
    if (!res.writableEnded) abortController.abort();
  };
  req.on('close', onClose);

  let streamedText = '';
  let startedStreaming = false;

  // The reply streams as raw text chunks (no SSE framing). Headers aren't flushed
  // until the first write, so an error before any text can still become a JSON
  // 502 below; after that, the status is committed and we can only end the stream.
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  try {
    const result = await runTurn({
      session: session.toObject(),
      problem,
      userText: message,
      diagramPromptBlock: promptBlock,
      // The opening turn starts the clock, so it gets the full limit.
      minutesLeft: session.startedAt ? minutesLeft(session) : session.timeLimitMinutes,
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
      persistedDiagram,
      slimJson,
      phaseAtTurn,
      turnStartedAt,
      assistantText,
      phaseAdvanced: Boolean(result.phaseAdvanced) && !result.aborted,
      nextPhaseName: result.nextPhase,
      advanceReason: result.advanceReason,
    });

    if (!res.writableEnded) res.end();
  } catch (err) {
    console.error('Interview turn failed:', err);

    // The candidate already saw part of a reply. Save what they saw (without a phase
    // advance) so the transcript matches the screen and the next turn has context.
    if (startedStreaming && streamedText) {
      try {
        await persistTurn({
          session,
          message,
          persistedDiagram,
          slimJson,
          phaseAtTurn,
          turnStartedAt,
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

    // The cause is logged above; vendor error text is not for the client.
    if (!res.headersSent) {
      return res.status(502).json({ error: 'Interview model call failed' });
    }

    if (!res.writableEnded) res.end();
  } finally {
    req.off('close', onClose);
  }
});

export default router;
