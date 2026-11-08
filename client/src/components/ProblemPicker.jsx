import { Lock, Sparkles } from 'lucide-react';
import { formatResetIn } from '../lib/quota.js';

function formatPrice({ amount, currency }) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount / 100);
}

function formatDate(value) {
  return new Date(value).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function PremiumBanner({ billing, onUpgrade, upgrading }) {
  if (!billing) return null;

  if (billing.isPremium) {
    return (
      <div className="mt-6 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
        <Sparkles size={16} className="shrink-0" />
        Premium active until {formatDate(billing.premiumUntil)}.
      </div>
    );
  }

  if (!billing.billingEnabled) return null;

  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/60 dark:bg-amber-950/40">
      <div className="text-sm text-amber-900 dark:text-amber-200">
        <p className="font-medium">Unlock premium problems</p>
        <p className="text-amber-800/80 dark:text-amber-200/70">
          {formatPrice(billing.pass)} for {billing.pass.days} days. One-time payment, no auto-renewal.
        </p>
      </div>
      <button
        type="button"
        disabled={upgrading}
        onClick={onUpgrade}
        className="shrink-0 rounded-md bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50 dark:bg-amber-500 dark:text-slate-950 dark:hover:bg-amber-400"
      >
        {upgrading ? 'Opening checkout…' : 'Get premium'}
      </button>
    </div>
  );
}

function InterviewQuota({ billing }) {
  const quota = billing?.interviews;
  if (!quota) return null;

  if (quota.remaining > 0) {
    return (
      <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
        {quota.remaining} of {quota.limit} interview{quota.limit === 1 ? '' : 's'} left today.
      </p>
    );
  }

  return (
    <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
      No interviews left today. More in {formatResetIn(quota.resetsAt)}
      {!billing.isPremium && billing.billingEnabled
        ? `, or get premium for ${billing.premiumDailyInterviews} a day.`
        : '.'}{' '}
      You can still open past sessions from the sidebar.
    </p>
  );
}

export default function ProblemPicker({ problems, onPick, creating, billing, onUpgrade, upgrading }) {
  const canUpgrade = Boolean(billing?.billingEnabled);

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
        Choose a problem
      </h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Start a new mock system design interview.
      </p>

      <InterviewQuota billing={billing} />

      <PremiumBanner billing={billing} onUpgrade={onUpgrade} upgrading={upgrading} />

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
                {p.tier === 'premium' && (
                  <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
                    <Sparkles size={12} />
                    Premium
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-slate-600 line-clamp-2 dark:text-slate-400">
                {p.prompt}
              </p>
            </div>
            {p.locked ? (
              <button
                type="button"
                disabled={!canUpgrade || upgrading}
                onClick={onUpgrade}
                title={canUpgrade ? 'Requires a premium pass' : 'Premium is not available yet'}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <Lock size={14} />
                Unlock
              </button>
            ) : (
              <button
                type="button"
                disabled={creating}
                onClick={() => onPick(p.slug)}
                className="shrink-0 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
              >
                Open
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
