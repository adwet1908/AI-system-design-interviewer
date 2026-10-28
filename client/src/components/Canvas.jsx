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
import ArchitectureNode from './canvas/ArchitectureNode.jsx';
import Palette from './canvas/Palette.jsx';
import { defaultLabel } from './canvas/nodeConfig.js';
import { apiJson } from '../lib/api.js';

const rfNodeTypes = { architecture: ArchitectureNode };

let idSeq = 1;
function nextId() {
  idSeq += 1;
  return `node_${Date.now()}_${idSeq}`;
}

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
}) {
  const onNodeDataChange = useCallback((nodeId, patch) => {
    setNodes((nds) =>
      nds.map((x) =>
        x.id === nodeId ? { ...x, data: { ...x.data, ...patch } } : x
      )
    );
    markDirty();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
      fitView({ padding: 0.2 });
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
    debounceRef.current = setTimeout(async () => {
      try {
        const token = await getToken();
        setNodes((nds) => {
          setEdges((eds) => {
            const body = toPayload(nds, eds);
            apiJson(`/api/sessions/${sessionId}/diagram`, {
              token,
              method: 'PATCH',
              body: JSON.stringify({ diagram: body }),
            })
              .then((data) => {
                dirtyRef.current = false;
                setSaveStatus('saved');
                onDiagramSaved?.(data.session?.diagram || body);
              })
              .catch((err) => {
                console.error(err);
                setSaveStatus('error');
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
    const pos =
      position ||
      screenToFlowPosition({
        x: (wrapRef.current?.clientWidth || 400) / 2,
        y: (wrapRef.current?.clientHeight || 300) / 2,
      });
    markDirty();
    setNodes((nds) => [
      ...nds,
      {
        id,
        type: 'architecture',
        position: pos,
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

  function clearCanvas() {
    if (!window.confirm('Clear the entire canvas?')) return;
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
            fitView
            deleteKeyCode={['Backspace', 'Delete']}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={16} />
            <Controls />
            <MiniMap pannable zoomable className="!bg-slate-50 dark:!bg-slate-800" />
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
        Open a session to draw
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
