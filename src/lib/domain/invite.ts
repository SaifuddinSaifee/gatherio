import { getNotifyAdapter } from '@/lib/adapters/notify';
import { renderMessage } from './messages';

export interface SendCaseInviteInput {
  to: string;
  partyName: string;
  caseName: string;
  workspaceName: string;
  link: string;
  expiresAt: Date;
}

export interface SendCaseInviteResult {
  sent: boolean;
  error?: string;
  providerMessageId?: string;
}

/**
 * Always called OUTSIDE the transaction that mints the access token —
 * never hold a transaction open across network IO — and never lets a
 * delivery failure become fatal: the case exists and the requester still
 * has the link on screen even if the email never lands. Delivery
 * tracking, bounces, and suppression are Stage 8.
 */
export async function sendCaseInvite(input: SendCaseInviteInput): Promise<SendCaseInviteResult> {
  const variables: Record<string, string> = {
    partyName: input.partyName,
    caseName: input.caseName,
    workspaceName: input.workspaceName,
    link: input.link,
    expiresAt: input.expiresAt.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
  };

  try {
    const { subject, body } = renderMessage('case_invite', variables);
    const adapter = await getNotifyAdapter();
    const result = await adapter.send({
      channel: 'email',
      recipient: { email: input.to },
      templateRef: 'case_invite',
      variables,
      subject,
      body,
    });
    return { sent: true, providerMessageId: result.providerMessageId };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : 'Failed to send invite email.' };
  }
}
