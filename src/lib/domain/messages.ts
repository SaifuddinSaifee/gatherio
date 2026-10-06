/**
 * templateRef -> rendered {subject, body}. notify.ts's docstring says
 * this copy lives here, not in the adapter — the adapter (notify.smtp.ts)
 * only ever sends what it's handed, it never composes prose itself.
 *
 * `case_reminder_unopened`/`case_reminder_stalled` are Stage 8.5's manual
 * "Send reminder" copy, reused as-is by Stage 8's automated scheduler —
 * see src/lib/domain/reminder.ts for how the `items`/`noteBlock`/`dueLine`
 * variables are assembled before reaching this renderer.
 */

export interface RenderedMessage {
  subject: string;
  body: string;
}

type TemplateRenderer = (variables: Record<string, string>) => RenderedMessage;

const TEMPLATES: Record<string, TemplateRenderer> = {
  case_invite: (v) => ({
    subject: `${v.workspaceName} needs some information from you`,
    body: [
      `Hi ${v.partyName},`,
      '',
      `${v.workspaceName} has requested some information for "${v.caseName}".`,
      '',
      `Open this link to see what's needed and get started:`,
      v.link,
      '',
      `This link expires on ${v.expiresAt}.`,
      '',
      `If you weren't expecting this, you can safely ignore this email.`,
    ].join('\n'),
  }),

  case_reminder_unopened: (v) => ({
    subject: `Reminder: ${v.workspaceName} is waiting on "${v.caseName}"`,
    body: [
      `Hi ${v.partyName},`,
      '',
      `"${v.caseName}" hasn't been started yet.`,
      ...(v.noteBlock ? ['', v.noteBlock] : []),
      '',
      `What's still needed:`,
      v.items,
      ...(v.dueLine ? ['', v.dueLine] : []),
      '',
      `Open your secure link — no account or password needed:`,
      v.link,
      '',
      `This link expires on ${v.expiresAt}. Links from earlier emails still work.`,
    ].join('\n'),
  }),

  case_reminder_stalled: (v) => ({
    subject: `Still needed for "${v.caseName}": ${v.itemCount} item${v.itemCount === '1' ? '' : 's'}`,
    body: [
      `Hi ${v.partyName},`,
      '',
      `Thanks for getting started on "${v.caseName}" — a few things are still needed.`,
      ...(v.noteBlock ? ['', v.noteBlock] : []),
      '',
      `What's still needed:`,
      v.items,
      ...(v.dueLine ? ['', v.dueLine] : []),
      '',
      `Open your secure link — no account or password needed:`,
      v.link,
      '',
      `This link expires on ${v.expiresAt}. Links from earlier emails still work.`,
    ].join('\n'),
  }),
};

export function renderMessage(templateRef: string, variables: Record<string, string>): RenderedMessage {
  const renderer = TEMPLATES[templateRef];
  if (!renderer) {
    throw new Error(`No message template registered for templateRef "${templateRef}".`);
  }
  return renderer(variables);
}
