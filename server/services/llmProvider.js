import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';

const client = new Anthropic({ apiKey: config.anthropicApiKey });

// On a safety-classifier decline, the API re-runs the request on Anthropic's
// recommended fallback model inside the same call (Claude API only).
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

/**
 * Stored history is already { role: 'user' | 'assistant', content: string },
 * which is the Messages API shape. Empty text blocks are rejected by the API.
 */
function toProviderMessages(messages) {
  return messages
    .filter((m) => typeof m.content === 'string' && m.content.trim())
    .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));
}

function textOf(message) {
  return message.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');
}

/**
 * Single streaming entry point for the app.
 * Vendor SDK stays in this module only.
 *
 * @param {object} params
 * @param {string} params.systemInstruction
 * @param {{ role: string, content: string }[]} params.messages
 * @param {object[]} [params.tools] - Anthropic tool definitions ({ name, description, input_schema })
 * @param {(chunk: string) => void} [params.onText]
 * @param {AbortSignal} [params.signal]
 * @returns {Promise<{ text: string, functionCalls: { name: string, args: object }[], aborted: boolean, refused: boolean }>}
 */
export async function streamChat({
  systemInstruction,
  messages,
  tools = [],
  onText,
  signal,
}) {
  const stream = client.beta.messages.stream(
    {
      model: config.anthropicModel,
      max_tokens: 16000,
      // Short conversational turns: low effort keeps time-to-first-token down.
      output_config: { effort: 'low' },
      system: systemInstruction,
      messages: toProviderMessages(messages),
      ...(tools.length
        ? { tools: tools.map((tool) => ({ ...tool, eager_input_streaming: true })) }
        : {}),
      betas: [FALLBACK_BETA],
      fallbacks: 'default',
    },
    { signal }
  );

  let text = '';
  stream.on('text', (delta) => {
    text += delta;
    if (typeof onText === 'function') onText(delta);
  });

  let message;
  try {
    message = await stream.finalMessage();
  } catch (err) {
    if (signal?.aborted || err instanceof Anthropic.APIUserAbortError) {
      return { text, functionCalls: [], aborted: true, refused: false };
    }
    if (err instanceof Anthropic.APIError) throw err;
    // With eager input streaming the SDK rejects when a tool input isn't valid
    // JSON. Keep the spoken reply; just don't act on the broken tool call.
    console.error('Discarding unparseable tool input:', err.message);
    return { text, functionCalls: [], aborted: false, refused: false };
  }

  // A refusal can cut a tool_use off mid-input, and max_tokens can truncate one:
  // only act on tool calls from a turn that ended normally.
  const functionCalls =
    message.stop_reason === 'tool_use'
      ? message.content
          .filter((block) => block.type === 'tool_use')
          .map((block) => ({ name: block.name, args: block.input ?? {} }))
      : [];

  return {
    text: text || textOf(message),
    functionCalls,
    aborted: false,
    refused: message.stop_reason === 'refusal',
  };
}

/**
 * Single one-shot structured-output entry point for the app.
 * Vendor SDK stays in this module only. Returns the raw JSON text;
 * callers parse/validate it (parsing is domain logic, not vendor logic).
 *
 * @param {object} params
 * @param {string} params.systemInstruction
 * @param {{ role: string, content: string }[]} params.messages
 * @param {object} params.responseSchema - JSON schema (every object needs additionalProperties: false)
 * @param {AbortSignal} [params.signal]
 * @returns {Promise<string>} raw JSON text
 */
export async function generateJson({
  systemInstruction,
  messages,
  responseSchema,
  signal,
}) {
  const message = await client.beta.messages.create(
    {
      model: config.anthropicModel,
      max_tokens: 16000,
      // Grading is judgment-heavy and runs once per interview.
      output_config: {
        effort: 'high',
        format: { type: 'json_schema', schema: responseSchema },
      },
      system: systemInstruction,
      messages: toProviderMessages(messages),
      betas: [FALLBACK_BETA],
      fallbacks: 'default',
    },
    { signal }
  );

  if (message.stop_reason === 'refusal') {
    throw new Error(`Model declined to respond (${message.stop_details?.category ?? 'unknown'})`);
  }
  if (message.stop_reason === 'max_tokens') {
    throw new Error('Model response hit max_tokens before the JSON was complete');
  }
  return textOf(message);
}

export function getLlmModelName() {
  return config.anthropicModel;
}
