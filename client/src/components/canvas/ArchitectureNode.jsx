import { memo, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { NODE_CONFIG_BY_TYPE, defaultLabel } from './nodeConfig.js';

function ArchitectureNode({ id, data, selected }) {
  const cfg = NODE_CONFIG_BY_TYPE[data.nodeType] || NODE_CONFIG_BY_TYPE.service;
  const Icon = cfg.Icon;
  const [editing, setEditing] = useState(null); // 'label' | 'note' | null
  const [draft, setDraft] = useState('');

  function startEdit(field) {
    setEditing(field);
    setDraft(field === 'label' ? data.label || '' : data.note || '');
  }

  function commit() {
    if (!editing) return;
    const next = draft.trim();
    if (editing === 'label') {
      data.onChange?.(id, { label: next || defaultLabel(data.nodeType) });
    } else {
      data.onChange?.(id, { note: next });
    }
    setEditing(null);
  }

  return (
    <div
      className={`w-[130px] rounded-md border-2 bg-white px-2 py-1.5 shadow-sm dark:bg-slate-800 dark:shadow-none ${
        selected ? 'ring-2 ring-slate-400 dark:ring-slate-500' : ''
      }`}
      style={{ borderColor: cfg.color }}
    >
      <Handle type="target" position={Position.Left} className="!bg-slate-500 dark:!bg-slate-400" />
      <div className="flex items-center gap-1.5">
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded"
          style={{ backgroundColor: `${cfg.color}22`, color: cfg.color }}
        >
          <Icon size={14} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
            {cfg.label}
          </div>
          {editing === 'label' ? (
            <input
              autoFocus
              className="w-full rounded border border-slate-300 px-1 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit();
                if (e.key === 'Escape') setEditing(null);
              }}
            />
          ) : (
            <div
              className="cursor-text truncate text-xs font-semibold text-slate-800 dark:text-slate-100"
              onDoubleClick={() => startEdit('label')}
              title="Double-click to edit label"
            >
              {data.label || cfg.label}
            </div>
          )}
        </div>
      </div>
      {editing === 'note' ? (
        <input
          autoFocus
          className="mt-1 w-full rounded border border-slate-300 px-1 text-[10px] text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') setEditing(null);
          }}
        />
      ) : (
        <div
          className="mt-0.5 cursor-text truncate text-[10px] text-slate-500 dark:text-slate-400"
          onDoubleClick={() => startEdit('note')}
          title="Double-click to edit note"
        >
          {data.note || 'Add note…'}
        </div>
      )}
      <Handle type="source" position={Position.Right} className="!bg-slate-500 dark:!bg-slate-400" />
    </div>
  );
}

export default memo(ArchitectureNode);
