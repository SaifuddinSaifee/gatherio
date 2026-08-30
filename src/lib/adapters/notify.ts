/**
 * Notify adapter. Messages are always a template reference plus
 * variables, never free text (techstack.md) — outside a 24-hour window
 * WhatsApp only permits pre-approved templates, and reminder copy is
 * exactly that case. Designing the interface this way now means adding
 * the WhatsApp channel later is a new driver, not a rewrite of every call
 * site that currently composes email strings by hand.
 *
 * `templateRef` names a template this codebase owns (see
 * src/lib/domain for the reminder copy that maps a template ref + the
 * unopened/stalled distinction to actual subject/body text); the adapter
 * itself never sees or constructs prose.
 */
export type NotifyChannel = 'email' | 'sms' | 'whatsapp';

export interface NotifyRecipient {
  email?: string;
  phone?: string;
}

export interface SendResult {
  providerMessageId?: string;
}

export interface NotifyAdapter {
  send(params: {
    channel: NotifyChannel;
    recipient: NotifyRecipient;
    templateRef: string;
    variables: Record<string, string>;
    subject?: string;
  }): Promise<SendResult>;
}

let cached: NotifyAdapter | undefined;

export async function getNotifyAdapter(): Promise<NotifyAdapter> {
  if (cached) return cached;
  const { env } = await import('@/lib/env');
  if (env.NOTIFY_DRIVER === 'postmark') {
    throw new Error('NOTIFY_DRIVER=postmark not implemented yet — Phase 1b.');
  }
  // 'local' and 'smtp' both go through the same SMTP transport; 'local'
  // just defaults its host/port to Mailpit (see .env.example).
  const { smtpNotifyAdapter } = await import('./notify.smtp');
  cached = smtpNotifyAdapter();
  return cached;
}
