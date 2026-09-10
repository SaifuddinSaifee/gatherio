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
    async send({ channel, recipient, subject, body }) {
      if (channel !== 'email') {
        throw new Error(`smtpNotifyAdapter cannot send channel "${channel}".`);
      }
      if (!recipient.email) {
        throw new Error('Email channel requires recipient.email.');
      }

      const info = await transport.sendMail({
        from: env.MAIL_FROM,
        to: recipient.email,
        subject,
        text: body,
      });

      return { providerMessageId: info.messageId };
    },
  };
}
