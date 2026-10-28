// Saved minute values may use numeric strings. Reject missing values before conversion.
export function savedMinute(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const minute = Number(value);
  return Number.isFinite(minute) ? minute : null;
}
export function savedInterval(task) {
  const start = savedMinute(task?.start), end = savedMinute(task?.end);
  return start !== null && end !== null && end > start ? {start, end} : null;
}
