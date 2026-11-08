import { useEffect, useState } from 'react';
import { PanelLeftClose, PanelLeftOpen, Plus, Trash2 } from 'lucide-react';
import { confirmToast } from '../lib/notify.jsx';

const COLLAPSED_KEY = 'sidebarCollapsed';

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

const iconButton =
  'rounded-md p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800';

export default function Sidebar({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewInterview,
  onDeleteSession,
  busySessionId,
  loading,
}) {
  const [collapsed, setCollapsed] = useState(readCollapsed);

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0');
    } catch {
      // storage unavailable: the choice just isn't remembered
    }
  }, [collapsed]);

  if (collapsed) {
    return (
      <aside className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-slate-200 bg-white py-3 dark:border-slate-700 dark:bg-slate-900">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          aria-label="Show sessions"
          title="Show sessions"
          className={iconButton}
        >
          <PanelLeftOpen size={18} />
        </button>
        <button
          type="button"
          onClick={onNewInterview}
          aria-label="New interview"
          title="New interview"
          className={iconButton}
        >
          <Plus size={18} />
        </button>
      </aside>
    );
  }

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center gap-2 border-b border-slate-200 p-4 dark:border-slate-700">
        <button
          type="button"
          onClick={onNewInterview}
          className="flex-1 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
        >
          New interview
        </button>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          aria-label="Hide sessions"
          title="Hide sessions"
          className={iconButton}
        >
          <PanelLeftClose size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          Past sessions
        </p>
        {loading && (
          <p className="px-1 text-sm text-slate-500 dark:text-slate-400">Loading…</p>
        )}
        {!loading && sessions.length === 0 && (
          <p className="px-1 text-sm text-slate-500 dark:text-slate-400">No sessions yet.</p>
        )}
        <ul className="space-y-1">
          {sessions.map((s) => {
            const active = s._id === activeSessionId;
            return (
              <li key={s._id} className="group relative">
                <button
                  type="button"
                  onClick={() => onSelectSession(s._id)}
                  className={`w-full rounded-md py-2 pr-9 pl-3 text-left text-sm ${
                    active
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                      : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="font-medium">{s.problemSlug}</div>
                  <div
                    className={`mt-0.5 text-xs ${
                      active
                        ? 'text-slate-300 dark:text-slate-600'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {s.messageCount === 0 ? 'not started' : `${s.phase} · ${s.status}`}
                  </div>
                </button>
                {s._id !== busySessionId && (
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await confirmToast(
                        `Delete this ${s.problemSlug} session? This can't be undone.`,
                        { confirmLabel: 'Delete', danger: true }
                      );
                      if (ok) onDeleteSession(s._id);
                    }}
                    aria-label="Delete session"
                    title="Delete session"
                    className={`absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-1.5 opacity-0 group-hover:opacity-100 focus:opacity-100 ${
                      active
                        ? 'text-slate-300 hover:bg-slate-700 hover:text-red-300 dark:text-slate-600 dark:hover:bg-slate-300 dark:hover:text-red-600'
                        : 'text-slate-400 hover:bg-slate-200 hover:text-red-600 dark:hover:bg-slate-700 dark:hover:text-red-400'
                    }`}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}
