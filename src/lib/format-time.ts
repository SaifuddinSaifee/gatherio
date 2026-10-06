const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const shortDate = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' });

/** "just now", "5 min ago", "3 hours ago", "yesterday", "4 days ago", then a short date past a week. Future dates use the same scale ("in 12 min"). */
export function formatRelative(date: Date, now: Date = new Date()): string {
  const diff = date.getTime() - now.getTime();
  const abs = Math.abs(diff);

  if (abs < MINUTE) return 'just now';
  if (abs < HOUR) {
    const minutes = Math.round(diff / MINUTE);
    return diff < 0 ? `${-minutes} min ago` : `in ${minutes} min`;
  }
  if (abs < DAY) return relative.format(Math.round(diff / HOUR), 'hour');
  if (abs < 7 * DAY) return relative.format(Math.round(diff / DAY), 'day');
  return shortDate.format(date);
}

/** Whole calendar-agnostic 24h periods since `createdAt`, never negative. */
export function daysOpen(createdAt: Date, now: Date = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - createdAt.getTime()) / DAY));
}

export function formatDate(date: Date): string {
  return shortDate.format(date);
}

export function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
