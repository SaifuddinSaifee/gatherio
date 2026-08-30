import { notFound } from 'next/navigation';
import {
  MdBusiness,
  MdCancel,
  MdCheckCircle,
  MdEditNote,
  MdLink,
  MdMail,
  MdPerson,
  MdRemoveCircleOutline,
  MdSchedule,
  MdVisibility,
} from 'react-icons/md';
import type { IconType } from 'react-icons';
import { getCurrentSession } from '@/db/session';
import { getWorkspaceById } from '@/db/workspace';
import { getCaseDetail } from '@/lib/domain/case';
import { env } from '@/lib/env';
import { AppHeader } from '@/components/app-header';
import { Card } from '@/components/ui/card';

const FULFILMENT_LABEL: Record<string, string> = {
  pending: 'Pending',
  viewed: 'Viewed',
  in_progress: 'In progress',
  submitted: 'Submitted',
  waived: 'Waived',
  cancelled: 'Cancelled',
};

const FULFILMENT_ICON: Record<string, IconType> = {
  pending: MdSchedule,
  viewed: MdVisibility,
  in_progress: MdEditNote,
  submitted: MdCheckCircle,
  waived: MdRemoveCircleOutline,
  cancelled: MdCancel,
};

export default async function CaseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ caseId: string }>;
  searchParams: Promise<{ newToken?: string }>;
}) {
  const session = await getCurrentSession();
  if (!session) return null;

  const { caseId } = await params;
  const { newToken } = await searchParams;

  const detail = await getCaseDetail(session.workspaceId, caseId);
  if (!detail) notFound();

  const [workspace] = await Promise.all([getWorkspaceById(session.workspaceId)]);

  return (
    <>
      <AppHeader workspaceName={workspace?.name ?? 'Workspace'} role={session.role} />
      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-headline-small font-medium text-md-on-surface">{detail.case.name}</h1>
        <p className="mt-1 text-body-medium text-md-on-surface-variant">
          {detail.templateName} (v{detail.templateVersionNumber})
          {detail.case.dueAt && ` · due ${detail.case.dueAt.toLocaleDateString()}`}
        </p>

        {newToken && (
          <Card variant="outlined" className="mt-6 border-md-primary">
            <p className="flex items-center gap-2 text-title-medium text-md-on-surface">
              <MdLink aria-hidden="true" className="h-5 w-5 text-md-primary" />
              Recipient link
            </p>
            <p className="mt-1 text-body-small text-md-on-surface-variant">
              This link is shown once. Copy it now — Gather stores only a hash of the token, not
              the token itself, so it cannot be shown again.
            </p>
            <code className="mt-3 block break-all rounded-sm bg-md-surface-container-high px-3 py-2 text-body-small text-md-on-surface">
              {env.APP_URL}/r/{newToken}
            </code>
          </Card>
        )}

        <h2 className="mt-8 text-title-medium text-md-on-surface">Recipient</h2>
        <Card className="mt-3">
          <p className="flex items-center gap-2 text-body-medium text-md-on-surface">
            <MdPerson aria-hidden="true" className="h-5 w-5 text-md-on-surface-variant" />
            {detail.party?.displayName}
          </p>
          {detail.party?.organizationName && (
            <p className="mt-1 flex items-center gap-2 text-body-small text-md-on-surface-variant">
              <MdBusiness aria-hidden="true" className="h-4.5 w-4.5" />
              {detail.party.organizationName}
            </p>
          )}
          {detail.party?.email && (
            <p className="mt-1 flex items-center gap-2 text-body-small text-md-on-surface-variant">
              <MdMail aria-hidden="true" className="h-4.5 w-4.5" />
              {detail.party.email}
            </p>
          )}
        </Card>

        <h2 className="mt-8 text-title-medium text-md-on-surface">Requirements</h2>
        <ul className="mt-3 flex flex-col gap-3">
          {detail.requirements.map(({ requirement, assignment }) => {
            const StatusIcon = assignment ? FULFILMENT_ICON[assignment.fulfilmentStatus] : null;
            return (
              <li key={requirement.id}>
                <Card className="flex items-center justify-between">
                  <p className="text-body-medium text-md-on-surface">{requirement.title}</p>
                  <span className="flex items-center gap-1.5 text-label-large text-md-on-surface-variant">
                    {StatusIcon && <StatusIcon aria-hidden="true" className="h-4.5 w-4.5" />}
                    {assignment ? FULFILMENT_LABEL[assignment.fulfilmentStatus] : '—'}
                  </span>
                </Card>
              </li>
            );
          })}
        </ul>
      </main>
    </>
  );
}
