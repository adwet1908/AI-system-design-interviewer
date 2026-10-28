import { NODE_TYPES } from './nodeConfig.js';

export default function Palette({ onAdd }) {
  function onDragStart(event, type) {
    event.dataTransfer.setData('application/reactflow', type);
    event.dataTransfer.effectAllowed = 'move';
  }

  return (
    <div className="flex w-40 shrink-0 flex-col border-r border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
      <p className="border-b border-slate-200 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
        Components
      </p>
      <ul className="flex-1 space-y-1 overflow-y-auto p-1.5">
        {NODE_TYPES.map(({ type, label, color, Icon }) => (
          <li key={type}>
            <button
              type="button"
              draggable
              onDragStart={(e) => onDragStart(e, type)}
              onClick={() => onAdd(type)}
              className="flex w-full items-center gap-1.5 rounded border border-slate-200 bg-white px-1.5 py-1 text-left text-[11px] text-slate-700 hover:border-slate-400 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-500"
              title="Click or drag onto canvas"
            >
              <span
                className="flex h-5 w-5 items-center justify-center rounded"
                style={{ backgroundColor: `${color}22`, color }}
              >
                <Icon size={12} />
              </span>
              <span className="truncate">{label}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
