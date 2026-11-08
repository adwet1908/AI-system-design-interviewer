import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Maximize2, Minimize2 } from 'lucide-react';
import ArchitectureNode from './canvas/ArchitectureNode.jsx';
import Palette from './canvas/Palette.jsx';
import { defaultLabel } from './canvas/nodeConfig.js';
import { apiJson } from '../lib/api.js';
import { confirmToast, notifyError } from '../lib/notify.jsx';

const rfNodeTypes = { architecture: ArchitectureNode };

// React Flow queues a fitView until nodes exist, so an empty canvas would zoom
// onto the first dropped node. Only fit when there is something to fit, and
// never zoom past 100%.
const FIT_VIEW_OPTIONS = { padding: 0.2, maxZoom: 1 };
const DEFAULT_VIEWPORT = { x: 0, y: 0, zoom: 1 };
// Approximate rendered node size, used to centre drops and avoid stacking.
const NODE_W = 130;
const NODE_H = 50;

/** Nudge a position down-right until it no longer sits on top of an existing node. */
function freePosition(nodes, pos) {
  let { x, y } = pos;
  for (let i = 0; i < 20; i += 1) {
    const hit = nodes.some(
      (n) => Math.abs(n.position.x - x) < NODE_W * 0.6 && Math.abs(n.position.y - y) < NODE_H
    );
    if (!hit) break;
    x += 30;
    y += 30;
  }
  return { x, y };
}

let idSeq = 1;
function nextId() {
  idSeq += 1;
  return `node_${Date.now()}_${idSeq}`;
}

/**
 * Saved diagram -> React Flow state. The node component edits its own label/note,
 * so each node carries the shared onChange callback in `data` (React Flow gives
 * custom nodes nothing else to call back through). toPayload strips it again.
 */
function toFlow(diagram, onChange) {
  const nodes = (diagram?.nodes || []).map((n) => ({
    id: n.id,
    type: 'architecture',
    position: n.position || { x: 0, y: 0 },
    data: {
      nodeType: n.type,
      label: n.data?.label ?? n.label ?? defaultLabel(n.type),
      note: n.data?.note ?? n.note ?? '',
      onChange,
    },
  }));
  const edges = (diagram?.edges || []).map((e, i) => ({
    id: e.id || `e-${e.source}-${e.target}-${i}`,
    source: e.source,
    target: e.target,
    label: e.label || e.data?.label || '',
    markerEnd: { type: 'arrowclosed' },
  }));
  return { nodes, edges };
}

function toPayload(nodes, edges) {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.data.nodeType,
      position: n.position,
      data: {
        label: n.data.label || '',
        note: n.data.note || '',
      },
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: typeof e.label === 'string' ? e.label : '',
      data: {
        label: typeof e.label === 'string' ? e.label : '',
      },
    })),
  };
}

function CanvasInner({
  sessionId,
  diagram,
  getToken,
  onDiagramSaved,
  saveStatus,
  setSaveStatus,
  expanded,
  onToggleExpand,
}) {
  // Stable identity (empty deps) on purpose: it's baked into every node's data, and
  // a new function each render would make every node look changed. It only uses
  // the setNodes setter and markDirty, both of which are safe to capture once.
  const onNodeDataChange = useCallback((nodeId, patch) => {
    setNodes((nds) =>
      nds.map((x) =>
        x.id === nodeId ? { ...x, data: { ...x.data, ...patch } } : x
      )
    );
    markDirty();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // dirty: the user changed something since the last successful save. React Flow
  // also emits changes on its own (measuring node sizes, selection), and those
  // must not trigger a save.
  // hydrated: the initial load has settled. Until then nothing saves, so loading a
  // session can't write the same diagram straight back.
  const dirtyRef = useRef(false);
  const hydratedRef = useRef(false);
  const debounceRef = useRef(null);
  const wrapRef = useRef(null);
  const { screenToFlowPosition, fitView } = useReactFlow();

  const seed = toFlow(diagram, onNodeDataChange);
  const [nodes, setNodes, onNodesChangeBase] = useNodesState(seed.nodes);
  const [edges, setEdges, onEdgesChangeBase] = useEdgesState(seed.edges);
  const [edgeLabelDraft, setEdgeLabelDraft] = useState('');
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);

  function markDirty() {
    dirtyRef.current = true;
  }

  // Hydrate once per session mount (CanvasInner remounts via key=sessionId)
  useEffect(() => {
    dirtyRef.current = false;
    hydratedRef.current = false;
    const next = toFlow(diagram, onNodeDataChange);
    setNodes(next.nodes);
    setEdges(next.edges);
    setTimeout(() => {
      if (next.nodes.length) fitView(FIT_VIEW_OPTIONS);
      hydratedRef.current = true;
    }, 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on mount / session key
  }, [sessionId]);

  const scheduleSave = useCallback(() => {
    if (!sessionId || !getToken || !dirtyRef.current || !hydratedRef.current) {
      return;
    }
    setSaveStatus('saving');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    // Debounce: dragging a node fires dozens of changes per second; save once
    // 1.5s after the last one.
    debounceRef.current = setTimeout(async () => {
      try {
        const token = await getToken();
        // This timer closed over nodes/edges from 1.5s ago. The updater form is
        // used only to read the latest state: both updaters return their input
        // unchanged, so nothing re-renders. (Side effects in updaters run twice
        // under StrictMode in dev, which is why you may see two PATCHes there.)
        setNodes((nds) => {
          setEdges((eds) => {
            const body = toPayload(nds, eds);
            apiJson(`/api/sessions/${sessionId}/diagram`, {
              token,
              method: 'PATCH',
              body: JSON.stringify({ diagram: body }),
            })
              .then((data) => {
                // Edits made while this request was in flight re-mark dirty and
                // have their own timer queued, so clearing here doesn't lose them.
                dirtyRef.current = false;
                setSaveStatus('saved');
                onDiagramSaved?.(data.session?.diagram || body);
              })
              .catch((err) => {
                console.error(err);
                setSaveStatus('error');
                // One id: repeated failures replace the toast instead of stacking.
                notifyError(`Couldn't save your diagram: ${err.message}`, 'diagram-save');
              });
            return eds;
          });
          return nds;
        });
      } catch (err) {
        console.error(err);
        setSaveStatus('error');
      }
    }, 1500);
  }, [sessionId, getToken, onDiagramSaved, setSaveStatus, setNodes, setEdges]);

  const onNodesChange = useCallback(
    (changes) => {
      onNodesChangeBase(changes);
      if (
        changes.some((c) =>
          ['position', 'remove', 'add', 'replace'].includes(c.type)
        )
      ) {
        markDirty();
      }
    },
    [onNodesChangeBase]
  );

  const onEdgesChange = useCallback(
    (changes) => {
      onEdgesChangeBase(changes);
      if (changes.some((c) => ['remove', 'add', 'replace'].includes(c.type))) {
        markDirty();
      }
    },
    [onEdgesChangeBase]
  );

  useEffect(() => {
    scheduleSave();
  }, [nodes, edges, scheduleSave]);

  const onConnect = useCallback(
    (params) => {
      if (params.source === params.target) return;
      markDirty();
      setEdges((eds) =>
        addEdge(
          { ...params, markerEnd: { type: 'arrowclosed' }, label: '' },
          eds
        )
      );
    },
    [setEdges]
  );

  const isValidConnection = useCallback((c) => c.source !== c.target, []);

  function addNode(type, position) {
    const id = nextId();
    let pos = position;
    if (!pos) {
      // screenToFlowPosition takes viewport (client) coordinates.
      const rect = wrapRef.current?.getBoundingClientRect();
      const center = rect
        ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
        : { x: 400, y: 300 };
      pos = screenToFlowPosition(center);
    }
    // Centre the node on the drop point rather than hanging it off the cursor.
    pos = { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 };
    markDirty();
    setNodes((nds) => [
      ...nds,
      {
        id,
        type: 'architecture',
        position: freePosition(nds, pos),
        data: {
          nodeType: type,
          label: defaultLabel(type),
          note: '',
          onChange: onNodeDataChange,
        },
      },
    ]);
  }

  function onDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  function onDrop(e) {
    e.preventDefault();
    const type = e.dataTransfer.getData('application/reactflow');
    if (!type) return;
    addNode(type, screenToFlowPosition({ x: e.clientX, y: e.clientY }));
  }

  async function clearCanvas() {
    const ok = await confirmToast('Clear the entire canvas?', { confirmLabel: 'Clear', danger: true });
    if (!ok) return;
    markDirty();
    setNodes([]);
    setEdges([]);
  }

  function applyEdgeLabel() {
    if (!selectedEdgeId) return;
    markDirty();
    setEdges((eds) =>
      eds.map((e) =>
        e.id === selectedEdgeId ? { ...e, label: edgeLabelDraft } : e
      )
    );
  }

  const statusLabel =
    saveStatus === 'saving'
      ? 'Saving…'
      : saveStatus === 'saved'
        ? 'Saved'
        : saveStatus === 'error'
          ? 'Save failed'
          : '';

  return (
    <div className="flex h-full min-h-0 flex-col bg-white dark:bg-slate-900">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-2 py-1.5 dark:border-slate-700">
        <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Architecture</span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-400 dark:text-slate-500">{statusLabel}</span>
          <button
            type="button"
            onClick={clearCanvas}
            className="rounded border border-slate-300 px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Clear
          </button>
          {onToggleExpand && (
            <button
              type="button"
              onClick={onToggleExpand}
              aria-label={expanded ? 'Show chat' : 'Expand canvas'}
              title={expanded ? 'Show chat' : 'Expand canvas'}
              className="rounded border border-slate-300 p-1 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {expanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
            </button>
          )}
        </div>
      </div>
      {selectedEdgeId && (
        <div className="flex items-center gap-1 border-b border-slate-100 px-2 py-1 dark:border-slate-700">
          <span className="text-[10px] text-slate-500 dark:text-slate-400">Edge label</span>
          <input
            className="flex-1 rounded border border-slate-300 px-1 text-[11px] text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            value={edgeLabelDraft}
            onChange={(e) => setEdgeLabelDraft(e.target.value)}
            onBlur={applyEdgeLabel}
            onKeyDown={(e) => e.key === 'Enter' && applyEdgeLabel()}
            placeholder="e.g. reads, writes, async"
          />
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        <Palette onAdd={(type) => addNode(type)} />
        <div className="min-h-0 flex-1" ref={wrapRef}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            isValidConnection={isValidConnection}
            nodeTypes={rfNodeTypes}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onEdgeClick={(_, edge) => {
              setSelectedEdgeId(edge.id);
              setEdgeLabelDraft(
                typeof edge.label === 'string' ? edge.label : ''
              );
            }}
            onPaneClick={() => setSelectedEdgeId(null)}
            defaultViewport={DEFAULT_VIEWPORT}
            deleteKeyCode={['Backspace', 'Delete']}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={16} />
            <Controls fitViewOptions={FIT_VIEW_OPTIONS} />
            {/* Top-right, small: at the bottom it covered the zoom controls on short panes. */}
            <MiniMap
              position="top-right"
              pannable
              zoomable
              style={{ width: 120, height: 80 }}
              className="!bg-slate-50 dark:!bg-slate-800"
            />
          </ReactFlow>
        </div>
      </div>
    </div>
  );
}

export default function Canvas(props) {
  if (!props.sessionId) {
    return (
      <div className="flex h-full items-center justify-center border-l border-slate-200 bg-slate-50 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
        Start the interview to draw
      </div>
    );
  }

  return (
    <div className="h-full border-l border-slate-200 dark:border-slate-700">
      <ReactFlowProvider>
        <CanvasInner key={props.sessionId} {...props} />
      </ReactFlowProvider>
    </div>
  );
}

export function getDiagramPayload(nodes, edges) {
  return toPayload(nodes, edges);
}
