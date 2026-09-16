import { cookies } from 'next/headers';
import { MdError, MdFolderOpen, MdSend } from 'react-icons/md';
import { getCurrentSession } from '@/db/session';
import { listCases } from '@/lib/domain/case';
import { sortForDashboard } from '@/lib/domain/dashboard';
import { parseCaseTableState, toCaseTableRow } from '@/lib/domain/dashboard-table';
import {
  DASHBOARD_HIDDEN_COLUMNS_COOKIE,
  DASHBOARD_VIEW_COOKIE,
  parseDashboardView,
  parseHiddenColumns,
} from '@/lib/dashboard-prefs';
import { Card } from '@/components/ui/card';
import { CaseCard } from './case-card';
import { CasesDashboard } from './cases-dashboard';

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function count(value: string | string[] | undefined): number {
  const n = Number.parseInt(first(value) ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** The outcome line after a bulk send — every case accounted for, with what to do about the ones that didn't go. */
function bulkReminderNotice(params: SearchParams): { text: string; failed: boolean } {
  const sent = count(params.sent);
  const skipped = count(params.skipped);
  const failed = count(params.failed);
  const parts = [`Sent ${plural(sent, 'reminder', 'reminders')}.`];
  if (skipped > 0) {
    parts.push(
      `${plural(skipped, 'case was', 'cases were')} skipped — complete, waiting on your review, no email, or reminded recently.`,
    );
  }
  if (failed > 0) parts.push(`${plural(failed, 'email', 'emails')} failed to send — try again.`);
  return { text: parts.join(' '), failed: failed > 0 };
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await getCurrentSession();
  if (!session) return null; // AppLayout already redirects; narrows the type below.

  const params = await searchParams;
  const cookieStore = await cookies();
  const view = parseDashboardView(cookieStore.get(DASHBOARD_VIEW_COOKIE)?.value);
  const now = new Date();

  const allCases = await listCases(session.workspaceId, now);
  const sorted = sortForDashboard(allCases);

  const notice = first(params.notice);
  const error = first(params.error);
  const noticeCaseId = first(params.caseId);
  const noticeCase = noticeCaseId
    ? allCases.find((row) => row.case.id === noticeCaseId)
    : undefined;
  const bulkNotice = notice === 'reminders_sent' ? bulkReminderNotice(params) : null;

  return (
    <CasesDashboard
      initialView={view}
      notices={
        <>
          {notice === 'reminder_sent' && (
            <p
              role="status"
              className="mt-4 flex items-center gap-2 text-body-small text-md-primary"
            >
              <MdSend aria-hidden="true" className="h-4.5 w-4.5 shrink-0" />
              Reminder sent{noticeCase ? ` for ${noticeCase.case.name}` : ''}.
            </p>
          )}
          {bulkNotice && (
            <p
              role="status"
              className={`mt-4 flex items-center gap-2 text-body-small ${bulkNotice.failed ? 'text-md-error' : 'text-md-primary'}`}
            >
              <MdSend aria-hidden="true" className="h-4.5 w-4.5 shrink-0" />
              {bulkNotice.text}
            </p>
          )}
          {error && (
            <p role="alert" className="mt-4 flex items-center gap-2 text-body-small text-md-error">
              <MdError aria-hidden="true" className="h-4.5 w-4.5 shrink-0" />
              {error}
            </p>
          )}
        </>
      }
      initialState={parseCaseTableState(params)}
      rows={sorted.map((row) => toCaseTableRow(row, now))}
      cards={Object.fromEntries(
        sorted.map((row) => [row.case.id, <CaseCard key={row.case.id} row={row} now={now} />]),
      )}
      now={now}
      initialHiddenColumns={parseHiddenColumns(
        cookieStore.get(DASHBOARD_HIDDEN_COLUMNS_COOKIE)?.value,
      )}
      empty={
        <Card className="flex items-center gap-3">
          <MdFolderOpen
            aria-hidden="true"
            className="h-6 w-6 shrink-0 text-md-on-surface-variant"
          />
          <p className="text-body-medium text-md-on-surface-variant">
            No cases yet. Publish a template, then create a case from it.
          </p>
        </Card>
      }
    />
  );
}
