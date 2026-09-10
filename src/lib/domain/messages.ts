/**
 * templateRef -> rendered {subject, body}. notify.ts's docstring says
 * this copy lives here, not in the adapter — the adapter (notify.smtp.ts)
 * only ever sends what it's handed, it never composes prose itself.
 * Stage 8 extends this map with reminder copy (unopened vs stalled).
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
};

export function renderMessage(templateRef: string, variables: Record<string, string>): RenderedMessage {
  const renderer = TEMPLATES[templateRef];
  if (!renderer) {
    throw new Error(`No message template registered for templateRef "${templateRef}".`);
  }
  return renderer(variables);
}
