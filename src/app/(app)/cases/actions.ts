'use server';

import { redirect } from 'next/navigation';
import { getCurrentSession } from '@/db/session';
import { instantiateCase } from '@/lib/domain/case';

export async function createCaseAction(formData: FormData): Promise<void> {
  const session = await getCurrentSession();
  if (!session) redirect('/sign-in');

  const templateId = String(formData.get('templateId') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  const dueAtRaw = String(formData.get('dueAt') ?? '');
  const partyType = String(formData.get('partyType') ?? 'individual') as 'individual' | 'organization';
  const displayName = String(formData.get('displayName') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim() || null;
  const phone = String(formData.get('phone') ?? '').trim() || null;
  const organizationName = String(formData.get('organizationName') ?? '').trim() || null;

  if (!templateId || !name || !displayName) {
    redirect('/cases/new?error=Template,+case+name,+and+recipient+name+are+required');
  }

  let caseId: string;
  let token: string;
  try {
    const result = await instantiateCase(session.workspaceId, session.userId, {
      templateId,
      name,
      dueAt: dueAtRaw ? new Date(dueAtRaw) : null,
      party: { partyType, displayName, email, phone, organizationName },
    });
    caseId = result.case.id;
    token = result.token;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not create case.';
    redirect(`/cases/new?error=${encodeURIComponent(message)}`);
  }

  redirect(`/cases/${caseId}?newToken=${encodeURIComponent(token)}`);
}
