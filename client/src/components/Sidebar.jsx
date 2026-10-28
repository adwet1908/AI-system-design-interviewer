export default function Sidebar({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewInterview,
  loading,
}) {
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <div className="border-b border-slate-200 p-4 dark:border-slate-700">
        <button
          type="button"
          onClick={onNewInterview}
          className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
        >
          New interview
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
              <li key={s._id}>
                <button
                  type="button"
                  onClick={() => onSelectSession(s._id)}
                  className={`w-full rounded-md px-3 py-2 text-left text-sm ${
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
                    {s.phase} · {s.status}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}
