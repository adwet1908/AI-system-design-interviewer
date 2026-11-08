import { streamChat } from './llmProvider.js';
import {
  buildSystemPrompt,
  nextPhase,
  toolsForPhase,
} from '../prompts.js';

const REFUSAL_REPLY =
  "I can't help with that one. Let's get back to the design: where would you like to pick up?";

/**
 * Transport-agnostic interview turn.
 * Streams text via onText(chunk). No Express / req / res here.
 * Does not import any vendor LLM SDK.
 *
 * @param {object} params
 * @param {object} params.session
 * @param {object} params.problem
 * @param {string} params.userText
 * @param {object} [params.diagram] - legacy; prefer diagramPromptBlock
 * @param {string} [params.diagramPromptBlock] - prebuilt diagram section for the system prompt
 * @param {number|null} [params.minutesLeft] - time left in the interview, null when unlimited
 * @param {(chunk: string) => void} params.onText
 * @param {{ signal?: AbortSignal }} [params.options]
 */
export async function runTurn({
  session,
  problem,
  userText,
  diagram,
  diagramPromptBlock,
  minutesLeft,
  onText,
  options = {},
}) {
  const system = buildSystemPrompt({
    problem,
    phase: session.phase,
    diagram,
    diagramPromptBlock,
    minutesLeft,
    timeLimitMinutes: session.timeLimitMinutes,
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
    messages.push({
      role: 'user',
      content:
        '[Interview start. The candidate can already see the problem prompt, so do not restate it. Greet them in one sentence and ask what they want to clarify. Do not reveal hidden requirements.]',
    });
  } else {
    throw new Error('Empty message');
  }

  const tools = toolsForPhase(session.phase);

  const result = await streamChat({
    systemInstruction: system,
    messages,
    tools,
    onText,
    signal: options.signal,
  });

  if (result.aborted) {
    return {
      assistantText: result.text,
      phaseAdvanced: false,
      nextPhase: null,
      advanceReason: null,
      aborted: true,
    };
  }

  let assistantText = result.text;
  if (result.refused && !assistantText.trim()) {
    // The model (and its fallback) declined this turn; keep the interview going.
    assistantText = REFUSAL_REPLY;
    if (typeof onText === 'function') onText(assistantText);
  }

  let phaseAdvanced = false;
  let advancedTo = null;
  let advanceReason = null;

  if (session.phase !== 'wrapup' && !result.refused) {
    const toolUse = (result.functionCalls || []).find(
      (fc) => fc.name === 'advance_phase'
    );
    if (toolUse) {
      const nxt = nextPhase(session.phase);
      if (nxt) {
        phaseAdvanced = true;
        advancedTo = nxt;
        const args = toolUse.args || {};
        advanceReason =
          typeof args.reason === 'string' ? args.reason : 'exit criteria met';
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
