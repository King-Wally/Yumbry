/** When a spent AI budget next accepts a request, in the reader's own time zone: just the time
 * when that is later today, otherwise the day as well. */
export function formatRetryAt(iso: string, locale: string, now: Date = new Date()): string {
  const at = new Date(iso);
  const sameDay = at.toDateString() === now.toDateString();
  return new Intl.DateTimeFormat(locale, {
    ...(sameDay ? {} : { weekday: 'long', day: 'numeric', month: 'long' }),
    hour: 'numeric',
    minute: '2-digit',
  }).format(at);
}
