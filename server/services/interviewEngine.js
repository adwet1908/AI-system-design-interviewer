import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import {
  buildSystemPrompt,
  nextPhase,
  toolsForPhase,
} from '../prompts.js';

const client = new Anthropic({ apiKey: config.anthropicApiKey });

/**
 * Transport-agnostic interview turn.
 * Streams text via onText(chunk). No Express / req / res here.
 *
 * @param {object} params
 * @param {object} params.session - mongoose session doc (or lean) with messages + phase
 * @param {object} params.problem - problem brief
 * @param {string} params.userText - candidate message (may be empty on first turn)
 * @param {object} params.diagram - latest slim diagram
 * @param {(chunk: string) => void} params.onText - called for each text delta
 * @param {{ signal?: AbortSignal }} [params.options]
 * @returns {Promise<{ assistantText: string, phaseAdvanced: boolean, nextPhase: string|null, advanceReason: string|null }>}
 */
export async function runTurn({
  session,
  problem,
  userText,
  diagram,
  onText,
  options = {},
}) {
  const system = buildSystemPrompt({
    problem,
    phase: session.phase,
    diagram,
  });

  const history = (session.messages || []).map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const messages = [...history];
  const trimmed = (userText || '').trim();
  if (trimmed) {
    messages.push({ role: 'user', content: trimmed });
  } else if (messages.length === 0) {
    // First turn: nudge the model to open the interview.
    messages.push({
      role: 'user',
      content:
        '[Interview start. Greet the candidate briefly and present the problem. Do not reveal hidden requirements.]',
    });
  } else {
    throw new Error('Empty message');
  }

  const tools = toolsForPhase(session.phase);
  const stream = client.messages.stream(
    {
      model: config.anthropicModel,
      max_tokens: 1024,
      system,
      messages,
      ...(tools.length ? { tools } : {}),
    },
    options.signal ? { signal: options.signal } : undefined
  );

  let assistantText = '';
  let aborted = false;

  if (options.signal) {
    const onAbort = () => {
      aborted = true;
      try {
        stream.abort();
      } catch {
        // ignore
      }
    };
    if (options.signal.aborted) onAbort();
    else options.signal.addEventListener('abort', onAbort, { once: true });
  }

  stream.on('text', (delta) => {
    assistantText += delta;
    if (typeof onText === 'function') onText(delta);
  });

  let finalMessage;
  try {
    finalMessage = await stream.finalMessage();
  } catch (err) {
    if (aborted || options.signal?.aborted) {
      return {
        assistantText,
        phaseAdvanced: false,
        nextPhase: null,
        advanceReason: null,
        aborted: true,
      };
    }
    throw err;
  }

  // Prefer accumulated stream text; fall back to final message text blocks.
  if (!assistantText && finalMessage?.content) {
    assistantText = finalMessage.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');
  }

  let phaseAdvanced = false;
  let advancedTo = null;
  let advanceReason = null;

  if (finalMessage?.content && session.phase !== 'wrapup') {
    const toolUse = finalMessage.content.find(
      (b) => b.type === 'tool_use' && b.name === 'advance_phase'
    );
    if (toolUse) {
      const nxt = nextPhase(session.phase);
      if (nxt) {
        phaseAdvanced = true;
        advancedTo = nxt;
        advanceReason =
          typeof toolUse.input?.reason === 'string'
            ? toolUse.input.reason
            : 'exit criteria met';
      }
    }
  }

  return {
    assistantText,
    phaseAdvanced,
    nextPhase: advancedTo,
    advanceReason,
    aborted: false,
  };
}
