import { GoogleGenAI } from '@google/genai';
import { config } from '../config.js';
import {
  buildSystemPrompt,
  nextPhase,
  toolsForPhase,
} from '../prompts.js';

const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

function toGeminiContents(messages) {
  return messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
}

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
 * @returns {Promise<{ assistantText: string, phaseAdvanced: boolean, nextPhase: string|null, advanceReason: string|null, aborted?: boolean }>}
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
  const contents = toGeminiContents(messages);

  const stream = await ai.models.generateContentStream({
    model: config.geminiModel,
    contents,
    config: {
      systemInstruction: system,
      maxOutputTokens: 1024,
      ...(options.signal ? { abortSignal: options.signal } : {}),
      ...(tools.length
        ? { tools: [{ functionDeclarations: tools }] }
        : {}),
    },
  });

  let assistantText = '';
  let aborted = false;
  let functionCalls = [];

  try {
    for await (const chunk of stream) {
      if (options.signal?.aborted) {
        aborted = true;
        break;
      }

      const text = chunk.text;
      if (text) {
        assistantText += text;
        if (typeof onText === 'function') onText(text);
      }

      if (chunk.functionCalls?.length) {
        functionCalls = chunk.functionCalls;
      }
    }
  } catch (err) {
    if (aborted || options.signal?.aborted || err?.name === 'AbortError') {
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

  if (aborted || options.signal?.aborted) {
    return {
      assistantText,
      phaseAdvanced: false,
      nextPhase: null,
      advanceReason: null,
      aborted: true,
    };
  }

  let phaseAdvanced = false;
  let advancedTo = null;
  let advanceReason = null;

  if (session.phase !== 'wrapup') {
    const toolUse = functionCalls.find((fc) => fc.name === 'advance_phase');
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
