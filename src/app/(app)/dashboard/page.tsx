import Link from 'next/link';
import { getCurrentSession } from '@/db/session';
import { getWorkspaceById } from '@/db/workspace';
import { listCases } from '@/lib/domain/case';
import { AppHeader } from '@/components/app-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

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
            <Button variant="filled">New case</Button>
          </Link>
        </div>

        {cases.length === 0 ? (
          <Card className="mt-8">
            <p className="text-body-medium text-md-on-surface-variant">
              No cases yet. Publish a template, then create a case from it.
            </p>
          </Card>
        ) : (
          <ul className="mt-8 flex flex-col gap-3">
            {cases.map(({ case: caseRow, templateName, party, totalRequirements, submittedRequirements }) => (
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
                      <span className="text-label-large text-md-on-surface-variant">
                        {caseRow.completedAt
                          ? 'Complete'
                          : `${submittedRequirements} of ${totalRequirements} submitted`}
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
