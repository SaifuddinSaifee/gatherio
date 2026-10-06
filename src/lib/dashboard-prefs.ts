import { HIDEABLE_COLUMN_IDS, type HideableColumnId } from '@/lib/domain/dashboard-table';

/**
 * Per-browser dashboard preferences (Stage 8.6). Cookies rather than
 * localStorage so the server renders the chosen view and columns on the
 * first response instead of flashing the defaults first.
 *
 * Both cookies are written in the browser (so switching views or columns
 * never waits on the server) and read by the server page. Both use
 * `path=/`, not `/dashboard`: a server action posted from another page
 * (sign-in) renders its `/dashboard` redirect inside that same request,
 * and a `/dashboard`-scoped cookie isn't sent with it.
 */

export const DASHBOARD_VIEWS = ['table', 'list'] as const;
export type DashboardView = (typeof DASHBOARD_VIEWS)[number];

// Not `gather_dashboard_view`: that name was set HttpOnly by a server action, and browsers refuse to let script overwrite it.
export const DASHBOARD_VIEW_COOKIE = 'gather_dashboard_view_v2';
export const DASHBOARD_HIDDEN_COLUMNS_COOKIE = 'gather_dashboard_hidden_columns';
export const DASHBOARD_PREF_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export const DEFAULT_HIDDEN_COLUMNS: readonly HideableColumnId[] = ['daysOpen', 'createdAt'];

/** Browser-only. */
export function writeDashboardPrefCookie(name: string, value: string): void {
  const secure = window.location.protocol === 'https:' ? '; secure' : '';
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${DASHBOARD_PREF_MAX_AGE_SECONDS}; samesite=lax${secure}`;
}

export function parseDashboardView(raw: string | null | undefined): DashboardView {
  return raw === 'list' ? 'list' : 'table';
}

/** A missing cookie means "never customised" and gets the defaults; an empty one means "show everything". */
export function parseHiddenColumns(raw: string | null | undefined): HideableColumnId[] {
  if (raw == null) return [...DEFAULT_HIDDEN_COLUMNS];
  return onlyHideable(raw.split(','));
}

export function serializeHiddenColumns(ids: readonly string[]): string {
  return onlyHideable(ids).join(',');
}

function onlyHideable(ids: readonly string[]): HideableColumnId[] {
  return [
    ...new Set(
      ids.filter((id): id is HideableColumnId =>
        (HIDEABLE_COLUMN_IDS as readonly string[]).includes(id),
      ),
    ),
  ];
}
