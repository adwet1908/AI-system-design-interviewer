import { useEffect, useRef, useState } from 'react';
import { Clock } from 'lucide-react';
import { formatResetIn } from '../lib/quota.js';

const PHASE_LABELS = {
  requirements: 'Requirements',
  estimation: 'Estimation',
  high_level: 'High-level',
  deep_dive: 'Deep dive',
  scale: 'Scale',
  wrapup: 'Wrap-up',
};

const CATEGORY_LABELS = {
  requirements: 'Requirements',
  estimation: 'Estimation',
  tradeoffs: 'Trade-offs',
  bottlenecks: 'Bottlenecks',
  communication: 'Communication',
};

const START_MARKER = '[Interview start]';

function formatClock(ms) {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Live mm:ss countdown. Re-renders itself every second, not the whole chat. */
function Countdown({ deadline }) {
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const ms = Math.max(0, deadline - now);
  const tone =
    ms <= 2 * 60_000
      ? 'text-red-600 dark:text-red-400'
      : ms <= 5 * 60_000
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-slate-600 dark:text-slate-300';

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium tabular-nums ${tone}`}
      title="Time left. The interview ends and is scored automatically at 0:00."
    >
      <Clock size={12} />
      {formatClock(ms)}
    </span>
  );
}

function EvaluationCard({ evaluation }) {
  const scored = Object.entries(CATEGORY_LABELS)
    .map(([key, label]) => ({ key, label, ...evaluation?.scores?.[key] }))
    .filter((c) => typeof c.score === 'number');
  const total = scored.reduce((sum, c) => sum + c.score, 0);

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Interview feedback</h3>
        {scored.length > 0 && (
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {(total / scored.length).toFixed(1)} / 5 overall
          </span>
        )}
      </div>
      {evaluation?.feedback && (
        <p className="mt-2 text-sm whitespace-pre-wrap text-slate-700 dark:text-slate-300">
          {evaluation.feedback}
        </p>
      )}
      {scored.length > 0 && (
        <ul className="mt-3 space-y-2">
          {scored.map((c) => (
            <li key={c.key} className="text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-slate-800 dark:text-slate-200">{c.label}</span>
                <span className="tabular-nums text-slate-600 dark:text-slate-400">{c.score} / 5</span>
              </div>
              {c.feedback && (
                <p className="mt-0.5 text-slate-600 dark:text-slate-400">{c.feedback}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function Chat({
  session,
  problem,
  streamingText,
  isStreaming,
  onSend,
  onStart,
  onStop,
  onEnd,
  ending,
  starting,
  deadline,
  timeLimit,
  timeUp,
  quota,
  outOfInterviews,
  onRetryScoring,
}) {
  const [draft, setDraft] = useState('');
  const listRef = useRef(null);

  const messages = session?.messages || [];
  const hasStarted = messages.length > 0 || Boolean(streamingText);
  const isCompleted = session?.status === 'completed';
  // Ended = no more turns; scoring may still be running in the background.
  const isEnded = isCompleted || session?.status === 'evaluating';
  const isScoring = ending || session?.status === 'evaluating';

  // Scroll only the message list: scrollIntoView also scrolls every ancestor,
  // which shifted the whole page.
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
  }, [messages, streamingText, isEnded, isScoring]);

  function handleSubmit(e) {
    e.preventDefault();
    if (!draft.trim() || isStreaming || isEnded) return;
    const text = draft;
    setDraft('');
    onSend(text);
  }

  function handleKeyDown(e) {
    // Enter sends, Shift+Enter is a newline; leave IME composition alone.
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      handleSubmit(e);
    }
  }

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-white dark:bg-slate-900">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
            {problem?.title || session?.problemSlug || 'Interview'}
          </h2>
          <div className="mt-1 flex items-center gap-2">
            <span className="inline-flex rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-800 ring-1 ring-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:ring-sky-800">
              {PHASE_LABELS[session?.phase] || session?.phase || '—'}
            </span>
            {session?.status && (
              <span className="text-xs text-slate-500 dark:text-slate-400">{session.status}</span>
            )}
            {!isEnded && deadline != null && <Countdown deadline={deadline} />}
            {!isEnded && deadline == null && timeLimit && (
              <span className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                <Clock size={12} />
                {timeLimit} min
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onEnd}
          disabled={!session || isEnded || isStreaming || ending}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          {ending ? 'Ending…' : 'End interview'}
        </button>
      </div>

      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {problem?.prompt && (
          <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-400">
            <span className="font-medium text-slate-800 dark:text-slate-200">Prompt: </span>
            {problem.prompt}
          </div>
        )}

        {!hasStarted && !isEnded && (
          <div className="rounded-md border border-dashed border-slate-300 px-4 py-6 text-center dark:border-slate-600">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Ready when you are. The interviewer will open with the problem.
            </p>
            {timeLimit && (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                You have {timeLimit} minutes from the start. The interview ends and is scored automatically when time runs out.
              </p>
            )}
            {quota && !outOfInterviews && (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Starting uses 1 of your {quota.remaining} remaining interview{quota.remaining === 1 ? '' : 's'} today.
              </p>
            )}
            {outOfInterviews && (
              <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
                You've used today's {quota.limit === 1 ? 'interview' : `${quota.limit} interviews`}. More in {formatResetIn(quota.resetsAt)}.
              </p>
            )}
            <button
              type="button"
              onClick={onStart}
              disabled={isStreaming || starting || outOfInterviews}
              className="mt-3 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
            >
              {starting ? 'Starting…' : 'Start interview'}
            </button>
          </div>
        )}

        {messages.map((m, i) =>
          m.role === 'user' && m.content === START_MARKER ? (
            <div
              key={`${m.at}-${i}`}
              className="flex items-center gap-3 text-xs text-slate-400 dark:text-slate-500"
            >
              <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
              Interview started
              <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
            </div>
          ) : (
          <div
            key={`${m.at}-${i}`}
            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                  : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200'
              }`}
            >
              {m.content}
              {m.event?.type === 'phase_advanced' && (
                <div className="mt-1 text-xs opacity-70">Phase advanced</div>
              )}
            </div>
          </div>
          )
        )}

        {isStreaming && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-lg bg-slate-100 px-3 py-2 text-sm whitespace-pre-wrap text-slate-800 dark:bg-slate-800 dark:text-slate-200">
              {streamingText || (
                <span className="text-slate-400 dark:text-slate-500">Thinking…</span>
              )}
            </div>
          </div>
        )}

        {isScoring && (
          <p className="rounded-md border border-dashed border-slate-300 px-4 py-3 text-center text-sm text-slate-500 dark:border-slate-600 dark:text-slate-400">
            {timeUp ? "Time's up. " : ''}Scoring your interview. This can take up to a minute…
          </p>
        )}

        {isCompleted && !session.evaluationError && <EvaluationCard evaluation={session.evaluation} />}

        {isCompleted && session.evaluationError && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm dark:border-red-900/60 dark:bg-red-950/40">
            <p className="text-red-800 dark:text-red-200">{session.evaluationError}</p>
            <button
              type="button"
              onClick={onRetryScoring}
              className="mt-3 rounded-md bg-slate-900 px-3 py-1.5 font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
            >
              Try scoring again
            </button>
          </div>
        )}

      </div>

      <form
        onSubmit={handleSubmit}
        className="flex items-end gap-2 border-t border-slate-200 p-3 dark:border-slate-700"
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isStreaming || isEnded || ending || timeUp || !hasStarted}
          rows={2}
          placeholder={
            isEnded
              ? 'Interview ended'
              : timeUp
                ? "Time's up"
                : !hasStarted
                  ? 'Start the interview first'
                  : 'Your answer… (Enter to send, Shift+Enter for a new line)'
          }
          className="min-h-[44px] flex-1 resize-none rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-500 disabled:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-slate-400 dark:disabled:bg-slate-900"
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
            disabled={!draft.trim() || isEnded || timeUp || !hasStarted}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
          >
            Send
          </button>
        )}
      </form>
    </div>
  );
}
