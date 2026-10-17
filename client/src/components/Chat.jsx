import { useEffect, useRef, useState } from 'react';

const PHASE_LABELS = {
  requirements: 'Requirements',
  estimation: 'Estimation',
  high_level: 'High-level',
  deep_dive: 'Deep dive',
  scale: 'Scale',
  wrapup: 'Wrap-up',
};

export default function Chat({
  session,
  problem,
  streamingText,
  isStreaming,
  onSend,
  onStart,
  onStop,
  onEnd,
  error,
}) {
  const [draft, setDraft] = useState('');
  const bottomRef = useRef(null);
  const listRef = useRef(null);

  const messages = session?.messages || [];
  const hasStarted = messages.length > 0 || Boolean(streamingText);
  const isCompleted = session?.status === 'completed';

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  function handleSubmit(e) {
    e.preventDefault();
    if (!draft.trim() || isStreaming || isCompleted) return;
    const text = draft;
    setDraft('');
    onSend(text);
  }

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-slate-900">
            {problem?.title || session?.problemSlug || 'Interview'}
          </h2>
          <div className="mt-1 flex items-center gap-2">
            <span className="inline-flex rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-800 ring-1 ring-sky-200">
              {PHASE_LABELS[session?.phase] || session?.phase || '—'}
            </span>
            <span className="text-xs text-slate-500">{session?.status}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={onEnd}
          disabled={isCompleted || isStreaming}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          End interview
        </button>
      </div>

      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {problem?.prompt && (
          <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
            <span className="font-medium text-slate-800">Prompt: </span>
            {problem.prompt}
          </div>
        )}

        {!hasStarted && !isCompleted && (
          <div className="rounded-md border border-dashed border-slate-300 px-4 py-6 text-center">
            <p className="text-sm text-slate-600">
              Ready when you are. The interviewer will open with the problem.
            </p>
            <button
              type="button"
              onClick={onStart}
              disabled={isStreaming}
              className="mt-3 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              Start interview
            </button>
          </div>
        )}

        {messages.map((m, i) => (
          <div
            key={`${m.at}-${i}`}
            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-800'
              }`}
            >
              {m.content === '[Interview start]' ? (
                <span className="italic opacity-70">(interview started)</span>
              ) : (
                m.content
              )}
              {m.event?.type === 'phase_advanced' && (
                <div className="mt-1 text-xs opacity-70">Phase advanced</div>
              )}
            </div>
          </div>
        ))}

        {isStreaming && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-lg bg-slate-100 px-3 py-2 text-sm whitespace-pre-wrap text-slate-800">
              {streamingText || (
                <span className="text-slate-400">Thinking…</span>
              )}
            </div>
          </div>
        )}

        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex items-end gap-2 border-t border-slate-200 p-3"
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={isStreaming || isCompleted || !hasStarted}
          rows={2}
          placeholder={
            isCompleted
              ? 'Interview ended'
              : !hasStarted
                ? 'Start the interview first'
                : 'Your answer…'
          }
          className="min-h-[44px] flex-1 resize-none rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 disabled:bg-slate-50"
        />
        {isStreaming ? (
          <button
            type="button"
            onClick={onStop}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500"
          >
            Stop
          </button>
        ) : (
          <button
            type="submit"
            disabled={!draft.trim() || isCompleted || !hasStarted}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            Send
          </button>
        )}
      </form>
    </div>
  );
}
