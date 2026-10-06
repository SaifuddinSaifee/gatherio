import type { StoredAnswer } from '@/lib/domain/answer';

/**
 * Renders a stored answer as the plain text a human reads — used by both
 * the recipient's completed-item summary and the requester's review
 * page, so the two sides never describe the same value differently.
 * Moved here from the recipient page's completed-item.tsx (Stage 7) once
 * the requester side needed the exact same rendering.
 */
export function formatAnswerValue(answer: StoredAnswer): string {
  switch (answer.fieldType) {
    case 'short_text':
    case 'long_text':
      return answer.text;
    case 'date':
      return answer.date;
    case 'choice':
      return answer.choice;
    case 'yes_no':
      return answer.yes ? 'Yes' : 'No';
    case 'acknowledge':
      return 'Acknowledged';
    case 'not_applicable':
      return 'Marked as not applicable';
  }
}

/**
 * The inverse direction: a stored answer back into the raw string
 * `AnswerField`'s single piece of form state expects (Stage 7) — used to
 * prefill a `changes_requested` item with what the recipient last sent,
 * so a one-word fix isn't a full retype. Only the text-like field types
 * round-trip into an editable value; an acknowledgement or a "doesn't
 * apply" declaration never reaches `AnswerField` in the first place (they
 * render their own controls), so both fall through to an empty string
 * rather than something misleading.
 */
export function answerToFormValue(answer: StoredAnswer): string {
  switch (answer.fieldType) {
    case 'short_text':
    case 'long_text':
      return answer.text;
    case 'date':
      return answer.date;
    case 'choice':
      return answer.choice;
    case 'yes_no':
      return answer.yes ? 'yes' : 'no';
    case 'acknowledge':
    case 'not_applicable':
      return '';
  }
}
