import { Show, SignInButton, UserButton, useAuth } from '@clerk/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { apiFetch, apiJson } from './lib/api.js';
import { useTheme } from './lib/theme.js';
import Sidebar from './components/Sidebar.jsx';
import Chat from './components/Chat.jsx';
import Canvas from './components/Canvas.jsx';
import DiagramDebugPanel from './components/DiagramDebugPanel.jsx';
import ProblemPicker from './components/ProblemPicker.jsx';

const isDev = import.meta.env.DEV;

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

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
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
  const [streamingText, setStreamingText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState(null);
  const [saveStatus, setSaveStatus] = useState('');
  const [diagramRefreshKey, setDiagramRefreshKey] = useState(0);
  const abortRef = useRef(null);
  const diagramRef = useRef({ nodes: [], edges: [] });

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
      setError(err.message);
    }
  }, [withToken]);

  useEffect(() => {
    refreshSessions();
    loadProblems();
  }, [refreshSessions, loadProblems]);

  async function loadSession(id) {
    setError(null);
    const token = await withToken();
    const data = await apiJson(`/api/sessions/${id}`, { token });
    setSession(data.session);
    setProblem(data.problem);
    diagramRef.current = data.session?.diagram || { nodes: [], edges: [] };
    setView('interview');
    setStreamingText('');
    setSaveStatus('');
  }

  async function handlePickProblem(slug) {
    setCreating(true);
    setError(null);
    try {
      const token = await withToken();
      const data = await apiJson('/api/sessions', {
        token,
        method: 'POST',
        body: JSON.stringify({ problemSlug: slug }),
      });
      setSession(data.session);
      setProblem(data.problem);
      diagramRef.current = data.session?.diagram || { nodes: [], edges: [] };
      setView('interview');
      setSaveStatus('');
      await refreshSessions();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function runInterviewTurn(message) {
    if (!session?._id || isStreaming) return;
    setError(null);
    setIsStreaming(true);
    setStreamingText('');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const token = await withToken();
      const res = await apiFetch(`/api/sessions/${session._id}/interview`, {
        token,
        method: 'POST',
        body: JSON.stringify({
          message,
          diagram: diagramRef.current || session.diagram || { nodes: [], edges: [] },
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Interview failed (${res.status})`);
      }

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
      await loadSession(session._id);
      await refreshSessions();
    } catch (err) {
      if (err.name === 'AbortError') {
        try {
          await loadSession(session._id);
          await refreshSessions();
        } catch {
          // ignore
        }
      } else {
        setError(err.message);
      }
    } finally {
      setIsStreaming(false);
      setStreamingText('');
      abortRef.current = null;
    }
  }

  function handleStop() {
    abortRef.current?.abort();
  }

  async function handleEnd() {
    if (!session?._id) return;
    setError(null);
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
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="flex h-[calc(100vh-57px)]">
      <Sidebar
        sessions={sessions}
        activeSessionId={session?._id}
        loading={sessionsLoading}
        onNewInterview={() => {
          setView('picker');
          setSession(null);
          setProblem(null);
          setError(null);
          setSaveStatus('');
        }}
        onSelectSession={(id) => loadSession(id).catch((e) => setError(e.message))}
      />

      <div className="flex min-w-0 flex-1">
        {view === 'picker' ? (
          <div className="flex-1 overflow-y-auto bg-white dark:bg-slate-900">
            {error && (
              <p className="px-6 pt-4 text-sm text-red-600 dark:text-red-400">{error}</p>
            )}
            <ProblemPicker
              problems={problems}
              onPick={handlePickProblem}
              creating={creating}
            />
          </div>
        ) : (
          <>
            <Chat
              session={session}
              problem={problem}
              streamingText={streamingText}
              isStreaming={isStreaming}
              error={error}
              onSend={(text) => runInterviewTurn(text)}
              onStart={() => runInterviewTurn('')}
              onStop={handleStop}
              onEnd={handleEnd}
            />
            <div className="hidden w-[42%] min-w-[280px] flex-col md:flex">
              <div className="min-h-0 flex-1">
                <Canvas
                  sessionId={session?._id}
                  diagram={session?.diagram || { nodes: [], edges: [] }}
                  getToken={withToken}
                  saveStatus={saveStatus}
                  setSaveStatus={setSaveStatus}
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
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3 dark:border-slate-700 dark:bg-slate-900">
        <h1 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          System Design Interviewer
        </h1>
        <div className="flex items-center gap-2">
          <ThemeToggle />
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
    </div>
  );
}
