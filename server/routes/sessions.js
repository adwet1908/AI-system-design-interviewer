import { Router } from 'express';
import { Session } from '../models/Session.js';
import { Problem } from '../models/Problem.js';
import { getUserId } from '../middleware/requireAuth.js';
import { evaluateSession } from '../services/evaluator.js';
import {
  buildDiagramContext,
  DiagramValidationError,
} from '../services/diagramSerializer.js';

const router = Router();

function publicProblem(problem) {
  if (!problem) return null;
  return {
    slug: problem.slug,
    title: problem.title,
    difficulty: problem.difficulty,
    prompt: problem.prompt,
  };
}

router.get('/problems', async (_req, res) => {
  try {
    const problems = await Problem.find()
      .select('slug title difficulty prompt')
      .sort({ title: 1 })
      .lean();
    res.json({ problems });
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

    const session = await Session.create({
      userId,
      problemSlug: problem.slug,
      phase: 'requirements',
      status: 'active',
      messages: [],
      diagram: { nodes: [], edges: [] },
    });

    res.status(201).json({
      session,
      problem: publicProblem(problem),
    });
  } catch (err) {
    console.error('Create session failed:', err);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

router.get('/sessions', async (req, res) => {
  try {
    const userId = getUserId(req);
    const sessions = await Session.find({ userId })
      .select('problemSlug phase status createdAt updatedAt')
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
      .select('slug title difficulty prompt')
      .lean();

    res.json({
      session,
      problem: publicProblem(problem),
    });
  } catch (err) {
    console.error('Get session failed:', err);
    res.status(500).json({ error: 'Failed to get session' });
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

    const problem = await Problem.findOne({ slug: session.problemSlug }).lean();
    const evaluation = await evaluateSession(session, problem);

    session.status = 'completed';
    session.evaluation = evaluation;
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
    await session.save();

    res.json({ session });
  } catch (err) {
    console.error('End session failed:', err);
    res.status(500).json({ error: 'Failed to end session' });
  }
});

export default router;
