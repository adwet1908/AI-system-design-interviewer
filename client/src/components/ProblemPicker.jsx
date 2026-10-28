export default function ProblemPicker({ problems, onPick, creating }) {
  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
        Choose a problem
      </h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Start a new mock system design interview.
      </p>

      <ul className="mt-6 space-y-3">
        {problems.map((p) => (
          <li
            key={p.slug}
            className="flex items-start justify-between gap-4 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800"
          >
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-medium text-slate-900 dark:text-slate-100">{p.title}</h3>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                  {p.difficulty}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-600 line-clamp-2 dark:text-slate-400">
                {p.prompt}
              </p>
            </div>
            <button
              type="button"
              disabled={creating}
              onClick={() => onPick(p.slug)}
              className="shrink-0 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
            >
              {creating ? 'Starting…' : 'Start'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
