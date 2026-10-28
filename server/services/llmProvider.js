import { GoogleGenAI } from '@google/genai';
import { config } from '../config.js';

const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

/**
 * Map stored chat roles to Gemini content roles.
 * History stores "assistant"; Gemini expects "model".
 */
function toProviderContents(messages) {
  return messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
}

/**
 * Single streaming entry point for the app.
 * Vendor SDK stays in this module only.
 *
 * @param {object} params
 * @param {string} params.systemInstruction
 * @param {{ role: string, content: string }[]} params.messages
 * @param {object[]} [params.tools] - Gemini functionDeclarations
 * @param {(chunk: string) => void} [params.onText]
 * @param {AbortSignal} [params.signal]
 * @returns {Promise<{ text: string, functionCalls: object[], aborted: boolean }>}
 */
export async function streamChat({
  systemInstruction,
  messages,
  tools = [],
  onText,
  signal,
}) {
  const contents = toProviderContents(messages);

  const stream = await ai.models.generateContentStream({
    model: config.geminiModel,
    contents,
    config: {
      systemInstruction,
      maxOutputTokens: 1024,
      ...(signal ? { abortSignal: signal } : {}),
      ...(tools.length
        ? { tools: [{ functionDeclarations: tools }] }
        : {}),
    },
  });

  let text = '';
  let aborted = false;
  let functionCalls = [];

  try {
    for await (const chunk of stream) {
      if (signal?.aborted) {
        aborted = true;
        break;
      }

      const delta = chunk.text;
      if (delta) {
        text += delta;
        if (typeof onText === 'function') onText(delta);
      }

      if (chunk.functionCalls?.length) {
        functionCalls = chunk.functionCalls;
      }
    }
  } catch (err) {
    if (aborted || signal?.aborted || err?.name === 'AbortError') {
      return { text, functionCalls: [], aborted: true };
    }
    throw err;
  }

  if (aborted || signal?.aborted) {
    return { text, functionCalls: [], aborted: true };
  }

  return { text, functionCalls, aborted: false };
}

/**
 * Single one-shot structured-output entry point for the app.
 * Vendor SDK stays in this module only. Returns the raw JSON text;
 * callers parse/validate it (parsing is domain logic, not vendor logic).
 *
 * @param {object} params
 * @param {string} params.systemInstruction
 * @param {{ role: string, content: string }[]} params.messages
 * @param {object} params.responseSchema - Gemini response JSON schema
 * @param {AbortSignal} [params.signal]
 * @returns {Promise<string>} raw JSON text
 */
export async function generateJson({
  systemInstruction,
  messages,
  responseSchema,
  signal,
}) {
  const contents = toProviderContents(messages);

  const response = await ai.models.generateContent({
    model: config.geminiModel,
    contents,
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
      responseSchema,
      maxOutputTokens: 2048,
      ...(signal ? { abortSignal: signal } : {}),
    },
  });

  return response.text;
}

export function getLlmModelName() {
  return config.geminiModel;
}
