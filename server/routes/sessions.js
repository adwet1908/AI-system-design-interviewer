import { Router } from 'express';
import { Session } from '../models/Session.js';
import { Problem } from '../models/Problem.js';
import { getUserId } from '../middleware/requireAuth.js';
import { evaluateSession } from '../services/evaluator.js';
import {
  buildDiagramContext,
  DiagramValidationError,
} from '../services/diagramSerializer.js';
import { lastDiagramSnapshot } from '../lib/diagram.js';
import { getEntitlement, canAccessProblem } from '../services/entitlements.js';
import { sessionTimer, timeLimitFor } from '../services/sessionTimer.js';
import {
  claimInterviewSlot,
  dailyLimitFor,
  releaseInterviewSlot,
} from '../services/usageQuota.js';
import { config } from '../config.js';

const router = Router();

function publicProblem(problem) {
  if (!problem) return null;
  return {
    slug: problem.slug,
    title: problem.title,
    difficulty: problem.difficulty,
    tier: problem.tier || 'free',
    prompt: problem.prompt,
  };
}

router.get('/problems', async (req, res) => {
  try {
    const [problems, entitlement] = await Promise.all([
      Problem.find()
        .select('slug title difficulty tier prompt')
        .sort({ tier: 1, title: 1 })
        .lean(),
      getEntitlement(getUserId(req)),
    ]);
    res.json({
      problems: problems.map((p) => ({
        ...publicProblem(p),
        locked: !canAccessProblem(p, entitlement),
      })),
    });
  } catch (err) {
    console.error('List problems failed:', err);
    res.status(500).json({ error: 'Failed to list problems' });
  }
});

router.post('/sessions', async (req, res) => {
  try {
    const userId = getUserId(req);
    const problemSlug = req.body?.problemSlug?.trim();

    if (!problemSlug) {
      return res.status(400).json({ error: 'problemSlug is required' });
    }

    const problem = await Problem.findOne({ slug: problemSlug }).lean();
    if (!problem) {
      return res.status(404).json({ error: 'Problem not found' });
    }

    // Gate at session creation only: a session started under an active pass
    // stays usable even if the pass expires mid-interview. Same for the time limit.
    const entitlement = await getEntitlement(userId);
    if (!canAccessProblem(problem, entitlement)) {
      return res.status(402).json({
        error: 'This problem requires a premium pass',
        code: 'premium_required',
      });
    }

    // Creating a session is what starts an interview (D-027), so the daily slot
    // is taken here, after the premium check so a locked problem doesn't use one.
    const quota = await claimInterviewSlot(
      userId,
      dailyLimitFor(entitlement, {
        freeLimit: config.freeDailyInterviews,
        premiumLimit: config.premiumDailyInterviews,
      })
    );
    if (!quota.allowed) {
      return res.status(429).json({
        error: entitlement.isPremium
          ? `You've used all ${quota.limit} interviews for today.`
          : `You've used your ${quota.limit === 1 ? 'free interview' : `${quota.limit} free interviews`} for today. Premium gives you ${config.premiumDailyInterviews} a day.`,
        code: 'daily_limit',
        usage: quota,
      });
    }

    let session;
    try {
      session = await Session.create({
        userId,
        problemSlug: problem.slug,
        phase: 'requirements',
        status: 'active',
        timeLimitMinutes: timeLimitFor(entitlement, {
          freeMinutes: config.freeSessionMinutes,
          premiumMinutes: config.premiumSessionMinutes,
        }),
        messages: [],
        diagram: { nodes: [], edges: [] },
      });
    } catch (err) {
      // Don't charge a slot for a session that was never saved.
      await releaseInterviewSlot(userId, quota.day).catch(() => {});
      throw err;
    }

    res.status(201).json({
      session,
      problem: publicProblem(problem),
      timer: sessionTimer(session),
    });
  } catch (err) {
    console.error('Create session failed:', err);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

router.get('/sessions', async (req, res) => {
  try {
    const userId = getUserId(req);
    // Sessions are only created on "Start interview" (D-027), so an empty one
    // means the opening turn failed. It's listed (as "not started") because it
    // used a daily slot and the user should be able to resume it.
    const sessions = await Session.find(
      { userId },
      {
        problemSlug: 1,
        phase: 1,
        status: 1,
        createdAt: 1,
        updatedAt: 1,
        messageCount: { $size: '$messages' },
      }
    )
      .sort({ createdAt: -1 })
      .lean();
    res.json({ sessions });
  } catch (err) {
    console.error('List sessions failed:', err);
    res.status(500).json({ error: 'Failed to list sessions' });
  }
});

router.get('/sessions/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    const session = await Session.findOne({
      _id: req.params.id,
      userId,
    }).lean();

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const problem = await Problem.findOne({ slug: session.problemSlug })
      .select('slug title difficulty tier prompt')
      .lean();

    res.json({
      session,
      problem: publicProblem(problem),
      timer: sessionTimer(session),
    });
  } catch (err) {
    console.error('Get session failed:', err);
    res.status(500).json({ error: 'Failed to get session' });
  }
});

router.delete('/sessions/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    const result = await Session.deleteOne({ _id: req.params.id, userId });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json({ deleted: true });
  } catch (err) {
    console.error('Delete session failed:', err);
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

router.get('/sessions/:id/diagram-context', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }

  try {
    const userId = getUserId(req);
    const session = await Session.findOne({
      _id: req.params.id,
      userId,
    }).lean();

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const previousSnapshot = lastDiagramSnapshot(session.messages || []);
    const ctx = buildDiagramContext(session.diagram, previousSnapshot);

    res.json({
      promptBlock: ctx.promptBlock,
      summaryText: ctx.summaryText,
      observationsText: ctx.observationsText,
      diffText: ctx.diffText,
      slimJson: ctx.slimJson,
    });
  } catch (err) {
    if (err instanceof DiagramValidationError) {
      return res.status(400).json({ error: err.message });
    }
    console.error('Diagram context failed:', err);
    res.status(500).json({ error: 'Failed to build diagram context' });
  }
});

router.patch('/sessions/:id/diagram', async (req, res) => {
  try {
    const userId = getUserId(req);
    const session = await Session.findOne({
      _id: req.params.id,
      userId,
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.status !== 'active') {
      return res.status(400).json({ error: 'Session is not active' });
    }

    try {
      const ctx = buildDiagramContext(req.body?.diagram ?? { nodes: [], edges: [] }, null);
      session.diagram = ctx.persistedDiagram;
      await session.save();
      return res.json({
        session: {
          _id: session._id,
          diagram: session.diagram,
          updatedAt: session.updatedAt,
        },
      });
    } catch (err) {
      if (err instanceof DiagramValidationError) {
        return res.status(400).json({ error: err.message });
      }
      throw err;
    }
  } catch (err) {
    console.error('Patch diagram failed:', err);
    res.status(500).json({ error: 'Failed to save diagram' });
  }
});

router.post('/sessions/:id/end', async (req, res) => {
  try {
    const userId = getUserId(req);
    const session = await Session.findOne({
      _id: req.params.id,
      userId,
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.status === 'completed') {
      return res.json({ session });
    }

    if (req.body?.diagram) {
      try {
        const ctx = buildDiagramContext(req.body.diagram, null);
        session.diagram = ctx.persistedDiagram;
      } catch (err) {
        if (err instanceof DiagramValidationError) {
          return res.status(400).json({ error: err.message });
        }
        throw err;
      }
    }

    const problem = await Problem.findOne({ slug: session.problemSlug }).lean();
    const evaluation = await evaluateSession(session, problem);

    session.status = 'completed';
    session.evaluation = evaluation;
    await session.save();

    res.json({ session });
  } catch (err) {
    console.error('End session failed:', err);
    res.status(500).json({ error: 'Failed to end session' });
  }
});

export default router;
