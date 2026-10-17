import { Show, SignInButton, UserButton, useAuth } from '@clerk/react';
import { useEffect, useState } from 'react';
import { apiFetch } from './lib/api.js';

function MeProbe() {
  const { getToken } = useAuth();
  const [userId, setUserId] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const token = await getToken();
        const res = await apiFetch('/api/me', { token });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        const data = await res.json();
        if (!cancelled) setUserId(data.userId);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [getToken]);

  if (error) {
    return <p className="text-sm text-red-600">Auth probe failed: {error}</p>;
  }

  if (!userId) {
    return <p className="text-sm text-slate-500">Checking /api/me…</p>;
  }

  return (
    <p className="text-sm text-slate-700">
      Signed in. Clerk userId from <code className="rounded bg-slate-100 px-1">/api/me</code>:{' '}
      <code className="rounded bg-slate-100 px-1">{userId}</code>
    </p>
  );
}

export default function App() {
  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
        <h1 className="text-lg font-semibold tracking-tight">System Design Interviewer</h1>
        <Show when="signed-in">
          <UserButton />
        </Show>
      </header>

      <main className="mx-auto max-w-xl px-6 py-16">
        <Show when="signed-out">
          <h2 className="mb-3 text-2xl font-semibold">Practice system design interviews</h2>
          <p className="mb-6 text-slate-600">
            Sign in to start a mock interview with an AI interviewer.
          </p>
          <SignInButton mode="modal">
            <button
              type="button"
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Sign in
            </button>
          </SignInButton>
        </Show>

        <Show when="signed-in">
          <h2 className="mb-3 text-2xl font-semibold">Welcome</h2>
          <MeProbe />
        </Show>
      </main>
    </div>
  );
}
