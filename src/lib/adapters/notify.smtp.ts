import nodemailer from 'nodemailer';
import { env } from '@/lib/env';
import type { NotifyAdapter } from './notify';

/**
 * Points at Mailpit in development (SMTP_HOST=localhost, SMTP_PORT=1025)
 * and at a real SMTP relay in production via the same env vars — the
 * driver code doesn't change, only where it's pointed. SMS/WhatsApp
 * drivers get added alongside this file when Phase 1b needs them; they
 * are not this file with a different transport, because template/variable
 * interpolation rules differ per channel (see notify.ts).
 */
export function smtpNotifyAdapter(): NotifyAdapter {
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: false,
  });

  return {
    async send({ channel, recipient, templateRef, variables, subject }) {
      if (channel !== 'email') {
        throw new Error(`smtpNotifyAdapter cannot send channel "${channel}".`);
      }
      if (!recipient.email) {
        throw new Error('Email channel requires recipient.email.');
      }

      const body = renderTemplate(templateRef, variables);
      const info = await transport.sendMail({
        from: env.MAIL_FROM,
        to: recipient.email,
        subject: subject ?? templateRef,
        text: body,
      });

      return { providerMessageId: info.messageId };
    },
  };
}

/**
 * Placeholder renderer — Stage 8 replaces this with the real template
 * library keyed by templateRef (and the unopened/stalled copy variants).
 * Kept dumb on purpose so nothing here tempts a call site into passing
 * free-form prose as `templateRef`.
 */
function renderTemplate(templateRef: string, variables: Record<string, string>): string {
  const vars = Object.entries(variables)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
  return `[template: ${templateRef}]\n${vars}`;
}
