import Link from 'next/link';
import { MdError, MdSend } from 'react-icons/md';
import { getCurrentSession } from '@/db/session';
import { getWorkspaceById } from '@/db/workspace';
import { listTemplates } from '@/lib/domain/template';
import { AppHeader } from '@/components/app-header';
import { Card } from '@/components/ui/card';
import { TextField } from '@/components/ui/text-field';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { createCaseAction } from '../actions';

export default async function NewCasePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getCurrentSession();
  if (!session) return null;

  const [workspace, allTemplates, { error }] = await Promise.all([
    getWorkspaceById(session.workspaceId),
    listTemplates(session.workspaceId),
    searchParams,
  ]);

  const publishableTemplates = allTemplates.filter(
    ({ template, latestVersion }) => !template.archivedAt && latestVersion?.status === 'active',
  );

  return (
    <>
      <AppHeader workspaceName={workspace?.name ?? 'Workspace'} role={session.role} />
      <main className="mx-auto max-w-md px-6 py-12">
        <Card className="p-8">
          <h1 className="text-title-large font-medium text-md-on-surface">New case</h1>
          <p className="mt-1 text-body-medium text-md-on-surface-variant">
            Phase 1a creates one case for one recipient. Multi-party cases are a later stage.
          </p>

          {error && (
            <p
              role="alert"
              className="mt-4 flex items-center gap-2 rounded-sm bg-md-error-container px-4 py-2 text-body-small text-md-on-error-container"
            >
              <MdError aria-hidden="true" className="h-4.5 w-4.5 shrink-0" />
              Error: {error}
            </p>
          )}

          {publishableTemplates.length === 0 ? (
            <p className="mt-6 text-body-medium text-md-on-surface-variant">
              No published templates yet.{' '}
              <Link href="/templates/new" className="text-md-primary hover:underline">
                Create one
              </Link>{' '}
              and publish it first.
            </p>
          ) : (
            <form action={createCaseAction} className="mt-6 flex flex-col gap-4">
              <Select label="Template" name="templateId" required defaultValue="">
                <option value="" disabled>
                  Choose a template
                </option>
                {publishableTemplates.map(({ template }) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </Select>
              <TextField
                label="Case name"
                name="name"
                placeholder="e.g. August 2026 Close: Acme Traders"
                required
              />
              <TextField label="Due date (optional)" name="dueAt" type="date" />

              <h2 className="mt-2 text-title-small text-md-on-surface">Recipient</h2>
              <Select label="Recipient type" name="partyType" defaultValue="individual">
                <option value="individual">Individual</option>
                <option value="organization">Organization</option>
              </Select>
              <TextField label="Recipient name" name="displayName" required />
              <TextField
                label="Organization name (if applicable)"
                name="organizationName"
              />
              <TextField label="Email (optional)" name="email" type="email" />
              <TextField label="Phone (optional)" name="phone" type="tel" />

              <Button type="submit" variant="filled" className="mt-2">
                <MdSend aria-hidden="true" className="h-4.5 w-4.5" />
                Create case
              </Button>
            </form>
          )}
        </Card>
      </main>
    </>
  );
}
