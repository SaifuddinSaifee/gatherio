import Link from 'next/link';
import { MdAdd, MdCheckCircle, MdFolderOpen, MdRateReview } from 'react-icons/md';
import { getCurrentSession } from '@/db/session';
import { getWorkspaceById } from '@/db/workspace';
import { listCases } from '@/lib/domain/case';
import type { CaseStatusCounts, CaseStatusResult } from '@/lib/domain/case-status';
import { AppHeader } from '@/components/app-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

/**
 * Stage 7: "submitted" stopped being the interesting fact once review
 * exists. `needs_review` outranks `awaiting_recipient` here the same way
 * it does in deriveCaseStatus — it's the requester's own move, so it's
 * the more urgent thing to surface on their own dashboard.
 */
function summaryLabel(status: CaseStatusResult['status'], counts: CaseStatusCounts): string {
  if (status === 'complete') return 'Complete';
  if (status === 'needs_review') return `Needs review · ${counts.needsReview}`;
  return `${counts.accepted} of ${counts.required} accepted`;
}

export default async function DashboardPage() {
  const session = await getCurrentSession();
  if (!session) return null; // AppLayout already redirects; narrows the type below.

  const [workspace, cases] = await Promise.all([
    getWorkspaceById(session.workspaceId),
    listCases(session.workspaceId),
  ]);

  return (
    <>
      <AppHeader workspaceName={workspace?.name ?? 'Workspace'} role={session.role} />
      <main className="mx-auto max-w-4xl px-6 py-12">
        <div className="flex items-center justify-between">
          <h1 className="text-headline-small font-medium text-md-on-surface">Cases</h1>
          <Link href="/cases/new">
            <Button variant="filled">
              <MdAdd aria-hidden="true" className="h-4.5 w-4.5" />
              New case
            </Button>
          </Link>
        </div>

        {cases.length === 0 ? (
          <Card className="mt-8 flex items-center gap-3">
            <MdFolderOpen aria-hidden="true" className="h-6 w-6 shrink-0 text-md-on-surface-variant" />
            <p className="text-body-medium text-md-on-surface-variant">
              No cases yet. Publish a template, then create a case from it.
            </p>
          </Card>
        ) : (
          <ul className="mt-8 flex flex-col gap-3">
            {cases.map(({ case: caseRow, templateName, party, status, counts }) => (
              <li key={caseRow.id}>
                <Link href={`/cases/${caseRow.id}`}>
                  <Card className="transition-colors duration-(--duration-effects-fast) hover:bg-md-surface-container-high">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-title-medium text-md-on-surface">{caseRow.name}</p>
                        <p className="mt-1 text-body-small text-md-on-surface-variant">
                          {templateName} · {party?.displayName ?? 'No recipient'}
                        </p>
                      </div>
                      <span className="flex items-center gap-1.5 text-label-large text-md-on-surface-variant">
                        {status === 'complete' && (
                          <MdCheckCircle aria-hidden="true" className="h-4.5 w-4.5 text-md-primary" />
                        )}
                        {status === 'needs_review' && (
                          <MdRateReview aria-hidden="true" className="h-4.5 w-4.5 text-md-tertiary" />
                        )}
                        {summaryLabel(status, counts)}
                      </span>
                    </div>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
