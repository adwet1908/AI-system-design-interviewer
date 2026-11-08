import { Show, SignInButton, UserButton, useAuth } from '@clerk/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { apiFetch, apiJson } from './lib/api.js';
import { ToastContainer } from 'react-toastify';
import { useTheme } from './lib/theme.js';
import { notifyError, notifyInfo, notifySuccess } from './lib/notify.jsx';
import { openCheckout } from './lib/razorpay.js';
import Sidebar from './components/Sidebar.jsx';
import Chat from './components/Chat.jsx';
import Canvas from './components/Canvas.jsx';
import DiagramDebugPanel from './components/DiagramDebugPanel.jsx';
import ProblemPicker from './components/ProblemPicker.jsx';

const isDev = import.meta.env.DEV;

const CANVAS_WIDTH_KEY = 'canvasWidthPct';
const DEFAULT_CANVAS_PCT = 42;
const MIN_CANVAS_PCT = 25;
const MAX_CANVAS_PCT = 80;

function clampCanvasPct(pct) {
  return Math.min(MAX_CANVAS_PCT, Math.max(MIN_CANVAS_PCT, pct));
}

function readCanvasPct() {
  try {
    const saved = Number(localStorage.getItem(CANVAS_WIDTH_KEY));
    return saved ? clampCanvasPct(saved) : DEFAULT_CANVAS_PCT;
  } catch {
    return DEFAULT_CANVAS_PCT;
  }
}

/** Draggable divider between chat and canvas; reports the canvas width as a % of the split. */
function SplitHandle({ containerRef, onResize, onReset }) {
  // Pointer capture keeps move/up events coming to the handle even when the
  // cursor leaves it or crosses the React Flow canvas (which would otherwise
  // swallow them), so listeners go on the handle, not on window.
  function handlePointerDown(e) {
    const container = containerRef.current;
    if (!container) return;
    e.preventDefault();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    document.body.style.userSelect = 'none';

    const onMove = (ev) => {
      const rect = container.getBoundingClientRect();
      onResize(clampCanvasPct(((rect.right - ev.clientX) / rect.width) * 100));
    };
    const onUp = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
      document.body.style.userSelect = '';
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize canvas"
      title="Drag to resize, double-click to reset"
      onPointerDown={handlePointerDown}
      onDoubleClick={onReset}
      className="hidden w-1.5 shrink-0 cursor-col-resize bg-slate-200 transition-colors hover:bg-sky-400 active:bg-sky-500 md:block dark:bg-slate-700 dark:hover:bg-sky-500"
    />
  );
}

function Landing() {
  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <h2 className="mb-3 text-2xl font-semibold text-slate-900 dark:text-slate-100">
        Practice system design interviews
      </h2>
      <p className="mb-6 text-slate-600 dark:text-slate-400">
        Chat with an AI interviewer that walks through requirements, estimation,
        architecture, and scale — using private problem briefs.
      </p>
      <SignInButton mode="modal">
        <button
          type="button"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
        >
          Sign in
        </button>
      </SignInButton>
    </main>
  );
}

function ThemeToggle({ theme, toggleTheme }) {
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label="Toggle dark mode"
      title="Toggle dark mode"
      className="rounded-md p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
    >
      {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

function InterviewApp() {
  const { getToken } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [problems, setProblems] = useState([]);
  const [view, setView] = useState('picker'); // picker | interview
  const [session, setSession] = useState(null);
  const [problem, setProblem] = useState(null);
  const [creating, setCreating] = useState(false);
  const [ending, setEnding] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const [diagramRefreshKey, setDiagramRefreshKey] = useState(0);
  const [billing, setBilling] = useState(null);
  const [upgrading, setUpgrading] = useState(false);
  const [canvasPct, setCanvasPct] = useState(readCanvasPct);
  const [canvasExpanded, setCanvasExpanded] = useState(false);
  // Interview clock. deadline is local epoch ms derived from the server's
  // remainingMs, so a wrong clock on this machine doesn't matter.
  const [timeLimit, setTimeLimit] = useState(null);
  const [deadline, setDeadline] = useState(null);
  const [timeUp, setTimeUp] = useState(false);
  const autoEndedRef = useRef(null);
  const abortRef = useRef(null);
  const diagramRef = useRef({ nodes: [], edges: [] });
  const splitRef = useRef(null);

  useEffect(() => {
    try {
      localStorage.setItem(CANVAS_WIDTH_KEY, String(Math.round(canvasPct)));
    } catch {
      // storage unavailable (private mode etc.): width just isn't remembered
    }
  }, [canvasPct]);

  const withToken = useCallback(async () => getToken(), [getToken]);

  const refreshSessions = useCallback(async () => {
    try {
      const token = await withToken();
      const data = await apiJson('/api/sessions', { token });
      setSessions(data.sessions || []);
    } catch (err) {
      console.error(err);
    } finally {
      setSessionsLoading(false);
    }
  }, [withToken]);

  const loadProblems = useCallback(async () => {
    try {
      const token = await withToken();
      const data = await apiJson('/api/problems', { token });
      setProblems(data.problems || []);
    } catch (err) {
      notifyError(err);
    }
  }, [withToken]);

  const loadBilling = useCallback(async () => {
    try {
      const token = await withToken();
      setBilling(await apiJson('/api/billing/status', { token }));
    } catch (err) {
      console.error(err);
    }
  }, [withToken]);

  useEffect(() => {
    refreshSessions();
    loadProblems();
    loadBilling();
  }, [refreshSessions, loadProblems, loadBilling]);

  async function handleUpgrade() {
    if (upgrading) return;
    setUpgrading(true);
    try {
      let token = await withToken();
      const order = await apiJson('/api/billing/order', { token, method: 'POST' });
      const result = await openCheckout(order, {
        description: `Premium pass · ${billing?.pass?.days ?? 30} days`,
      });
      if (!result) return; // user closed the modal

      // Checkout can run for minutes; fetch a fresh token for the verify call.
      token = await withToken();
      const entitlement = await apiJson('/api/billing/verify', {
        token,
        method: 'POST',
        body: JSON.stringify(result),
      });
      await Promise.all([loadBilling(), loadProblems()]);
      notifySuccess(
        entitlement?.premiumUntil
          ? `Premium unlocked until ${new Date(entitlement.premiumUntil).toLocaleDateString()}.`
          : 'Premium unlocked.'
      );
    } catch (err) {
      notifyError(err);
    } finally {
      setUpgrading(false);
    }
  }

  function applyTimer(timer) {
    const remaining = timer?.remainingMs ?? null;
    setTimeLimit(timer?.limitMinutes ?? null);
    setDeadline(remaining == null ? null : Date.now() + remaining);
    setTimeUp(remaining === 0);
  }

  // Flip timeUp when the clock runs out.
  useEffect(() => {
    if (deadline == null || timeUp) return undefined;
    const id = setTimeout(() => setTimeUp(true), Math.max(0, deadline - Date.now()));
    return () => clearTimeout(id);
  }, [deadline, timeUp]);

  // Auto-end once time is up. A reply that is still streaming finishes first.
  // Only tried once per session: if it fails, the error shows and the End
  // button still works, instead of retrying in a loop.
  useEffect(() => {
    if (!timeUp || session?.status !== 'active' || isStreaming || ending) return;
    if (autoEndedRef.current === session._id) return;
    autoEndedRef.current = session._id;
    notifyInfo("Time's up. Ending the interview and scoring it.", `time-up-${session._id}`);
    handleEnd();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleEnd reads current state
  }, [timeUp, session?._id, session?.status, isStreaming, ending]);

  async function loadSession(id) {
    const token = await withToken();
    const data = await apiJson(`/api/sessions/${id}`, { token });
    setSession(data.session);
    setProblem(data.problem);
    applyTimer(data.timer);
    diagramRef.current = data.session?.diagram || { nodes: [], edges: [] };
    setView('interview');
    setStreamingText('');
    setSaveStatus('');
  }

  // Picking a problem only previews it; the session is created on "Start interview",
  // so browsing problems doesn't leave empty sessions behind.
  function handlePickProblem(slug) {
    const picked = problems.find((p) => p.slug === slug);
    if (!picked) return;
    setSession(null);
    setProblem(picked);
    applyTimer(null);
    diagramRef.current = { nodes: [], edges: [] };
    setView('interview');
    setSaveStatus('');
  }

  async function handleStart() {
    if (session?._id) return runInterviewTurn('');
    if (!problem?.slug || creating) return;
    setCreating(true);
    try {
      const token = await withToken();
      const data = await apiJson('/api/sessions', {
        token,
        method: 'POST',
        body: JSON.stringify({ problemSlug: problem.slug }),
      });
      setSession(data.session);
      setProblem(data.problem);
      applyTimer(data.timer);
      diagramRef.current = data.session?.diagram || { nodes: [], edges: [] };
      loadBilling(); // a daily slot was just used
      await runInterviewTurn('', data.session);
    } catch (err) {
      notifyError(err);
      // 429 daily_limit: refresh so the UI shows the quota as used up.
      if (err.data?.code === 'daily_limit') loadBilling();
    } finally {
      setCreating(false);
    }
  }

  async function runInterviewTurn(message, target = session) {
    if (!target?._id || isStreaming) return;
    setIsStreaming(true);
    setStreamingText('');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const token = await withToken();
      const res = await apiFetch(`/api/sessions/${target._id}/interview`, {
        token,
        method: 'POST',
        body: JSON.stringify({
          message,
          diagram: diagramRef.current || target.diagram || { nodes: [], edges: [] },
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        // The server's clock says time is up: let the auto-end take over.
        if (data.code === 'time_up') {
          setTimeUp(true);
          return;
        }
        throw new Error(data.error || `Interview failed (${res.status})`);
      }

      // The server streams plain text. Accumulate it and re-render as it arrives;
      // `stream: true` keeps a multi-byte character split across two chunks from
      // turning into garbage. The streamed text is display-only: once done, the
      // saved transcript is reloaded as the source of truth.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setStreamingText(acc);
      }

      // Refetch session for persisted messages + phase badge.
      await loadSession(target._id);
      await refreshSessions();
    } catch (err) {
      // Stop button: the server saves whatever was streamed before the abort, so
      // reload to show it rather than treating the stop as an error.
      if (err.name === 'AbortError') {
        try {
          await loadSession(target._id);
          await refreshSessions();
        } catch {
          // ignore
        }
      } else {
        notifyError(err);
      }
    } finally {
      setIsStreaming(false);
      setStreamingText('');
      abortRef.current = null;
    }
  }

  async function handleDeleteSession(id) {
    try {
      const token = await withToken();
      await apiJson(`/api/sessions/${id}`, { token, method: 'DELETE' });
      if (session?._id === id) showPicker();
      await refreshSessions();
      notifySuccess('Session deleted.');
    } catch (err) {
      notifyError(err);
    }
  }

  function showPicker() {
    setView('picker');
    setSession(null);
    setProblem(null);
    applyTimer(null);
    setSaveStatus('');
  }

  function handleStop() {
    abortRef.current?.abort();
  }

  async function handleEnd() {
    if (!session?._id || ending) return;
    setEnding(true);
    try {
      const token = await withToken();
      const data = await apiJson(`/api/sessions/${session._id}/end`, {
        token,
        method: 'POST',
        body: JSON.stringify({
          diagram: diagramRef.current || session.diagram || { nodes: [], edges: [] },
        }),
      });
      setSession(data.session);
      await refreshSessions();
      notifySuccess('Interview scored. Your feedback is in the chat.', `scored-${data.session?._id}`);
    } catch (err) {
      notifyError(err);
    } finally {
      setEnding(false);
    }
  }

  // Only matters before a session exists: resuming one never uses a new slot.
  const outOfInterviews = !session && billing?.interviews?.remaining === 0;

  // A streaming turn or running evaluation would save into a deleted session.
  const busySessionId = isStreaming || ending ? session?._id : null;

  return (
    <div className="flex min-h-0 flex-1">
      <Sidebar
        sessions={sessions}
        activeSessionId={session?._id}
        loading={sessionsLoading}
        onNewInterview={showPicker}
        onDeleteSession={handleDeleteSession}
        busySessionId={busySessionId}
        onSelectSession={(id) => loadSession(id).catch((e) => notifyError(e))}
      />

      <div ref={splitRef} className="flex min-w-0 flex-1">
        {view === 'picker' ? (
          <div className="flex-1 overflow-y-auto bg-white dark:bg-slate-900">
            <ProblemPicker
              problems={problems}
              onPick={handlePickProblem}
              creating={creating}
              billing={billing}
              onUpgrade={handleUpgrade}
              upgrading={upgrading}
            />
          </div>
        ) : (
          <>
            {/* Hidden rather than unmounted when the canvas is expanded, so a draft reply survives. */}
            <div className={canvasExpanded ? 'hidden' : 'flex min-w-0 flex-1'}>
              <Chat
                session={session}
                problem={problem}
                streamingText={streamingText}
                isStreaming={isStreaming}
                onSend={(text) => runInterviewTurn(text)}
                onStart={handleStart}
                onStop={handleStop}
                onEnd={handleEnd}
                starting={creating}
                ending={ending}
                quota={session ? null : billing?.interviews}
                outOfInterviews={outOfInterviews}
                deadline={deadline}
                timeLimit={timeLimit ?? billing?.sessionMinutes ?? null}
                timeUp={timeUp}
              />
            </div>
            {!canvasExpanded && (
              <SplitHandle
                containerRef={splitRef}
                onResize={setCanvasPct}
                onReset={() => setCanvasPct(DEFAULT_CANVAS_PCT)}
              />
            )}
            <div
              className={`hidden min-w-[280px] flex-col md:flex ${canvasExpanded ? 'flex-1' : 'shrink-0'}`}
              style={canvasExpanded ? undefined : { width: `${canvasPct}%` }}
            >
              <div className="min-h-0 flex-1">
                <Canvas
                  sessionId={session?._id}
                  diagram={session?.diagram || { nodes: [], edges: [] }}
                  getToken={withToken}
                  saveStatus={saveStatus}
                  setSaveStatus={setSaveStatus}
                  expanded={canvasExpanded}
                  onToggleExpand={() => setCanvasExpanded((x) => !x)}
                  onDiagramSaved={(d) => {
                    diagramRef.current = d;
                    setSession((s) => (s ? { ...s, diagram: d } : s));
                    setDiagramRefreshKey((k) => k + 1);
                  }}
                />
              </div>
              <DiagramDebugPanel
                enabled={isDev}
                sessionId={session?._id}
                getToken={withToken}
                refreshKey={diagramRefreshKey}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const { theme, toggleTheme } = useTheme();
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-50 dark:bg-slate-900">
      <header className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6 py-3 dark:border-slate-700 dark:bg-slate-900">
        <h1 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          System Design Interviewer
        </h1>
        <div className="flex items-center gap-2">
          <ThemeToggle theme={theme} toggleTheme={toggleTheme} />
          <Show when="signed-in">
            <UserButton />
          </Show>
        </div>
      </header>

      <Show when="signed-out">
        <Landing />
      </Show>

      <Show when="signed-in">
        <InterviewApp />
      </Show>

      <ToastContainer
        position="bottom-right"
        autoClose={4000}
        newestOnTop
        theme={theme === 'dark' ? 'dark' : 'light'}
      />
    </div>
  );
}
