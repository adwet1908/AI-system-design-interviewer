import { slimEqual } from '../services/diagramSerializer.js';

/**
 * Last slim snapshot stored on a user message (for diff).
 * persistTurn only stores a snapshot when the diagram changed, so most messages
 * have none: walk back to the most recent one.
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
