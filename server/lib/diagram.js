export function slimDiagram(diagram) {
  if (!diagram || typeof diagram !== 'object') {
    return { nodes: [], edges: [] };
  }

  const nodes = Array.isArray(diagram.nodes)
    ? diagram.nodes.map((n) => ({
        id: String(n.id ?? ''),
        type: String(n.type ?? 'default'),
        label: String(n.label ?? n.data?.label ?? ''),
      }))
    : [];

  const edges = Array.isArray(diagram.edges)
    ? diagram.edges.map((e) => ({
        source: String(e.source ?? ''),
        target: String(e.target ?? ''),
      }))
    : [];

  return { nodes, edges };
}

export function diagramsEqual(a, b) {
  return JSON.stringify(slimDiagram(a)) === JSON.stringify(slimDiagram(b));
}

export function lastDiagramSnapshot(messages) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const snap = messages[i]?.diagramSnapshot;
    if (snap) return slimDiagram(snap);
  }
  return null;
}
