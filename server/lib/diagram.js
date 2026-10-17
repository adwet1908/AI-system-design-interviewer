import { slimEqual } from '../services/diagramSerializer.js';

/**
 * Last slim snapshot stored on a user message (for diff).
 */
export function lastDiagramSnapshot(messages) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const snap = messages[i]?.diagramSnapshot;
    if (snap) return snap;
  }
  return null;
}

export function diagramsEqual(a, b) {
  return slimEqual(a, b);
}
