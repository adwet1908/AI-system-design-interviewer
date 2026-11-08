/** "5h 12m" / "12m" until the daily interview quota resets. */
export function formatResetIn(resetsAt, now = Date.now()) {
  const minutes = Math.max(1, Math.ceil((new Date(resetsAt).getTime() - now) / 60_000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}
