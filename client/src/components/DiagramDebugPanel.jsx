import { useCallback, useEffect, useState } from 'react';
import { apiJson } from '../lib/api.js';

/**
 * Dev-only collapsible panel showing the exact promptBlock the interviewer gets.
 */
export default function DiagramDebugPanel({
  sessionId,
  getToken,
  refreshKey,
  enabled,
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!sessionId || !enabled) return;
    try {
      const token = await getToken();
      const data = await apiJson(
        `/api/sessions/${sessionId}/diagram-context`,
        { token }
      );
      setText(data.promptBlock || '');
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, [sessionId, getToken, enabled]);

  useEffect(() => {
    if (open) load();
  }, [open, refreshKey, load]);

  if (!enabled) return null;

  return (
    <div className="border-t border-amber-200 bg-amber-50/80 dark:border-amber-900 dark:bg-amber-950/40">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-1.5 text-left text-[11px] font-medium text-amber-900 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900/40"
      >
        <span>What the interviewer sees (dev)</span>
        <span>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="max-h-48 overflow-auto border-t border-amber-200 px-3 py-2 dark:border-amber-900">
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
          <pre className="whitespace-pre-wrap font-mono text-[10px] text-slate-700 dark:text-slate-300">
            {text || '(empty)'}
          </pre>
        </div>
      )}
    </div>
  );
}
