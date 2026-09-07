/**
 * Isomorphic answer validation (Stage 6) — imported by both the recipient
 * page's client island (instant inline errors) and the server action
 * (the authoritative check) so client and server rules cannot drift.
 * Hand-rolled rather than zod: zod is confined to src/lib/env.ts by
 * existing project convention.
 *
 * Deliberately DB-free — takes a plain AnswerableRequirement shape rather
 * than importing the drizzle schema, so this module has zero dependency
 * on anything that only runs on the server.
 */

export type AnswerFieldType = 'short_text' | 'long_text' | 'date' | 'choice' | 'yes_no';

export interface AnswerableRequirement {
  answerFieldType: AnswerFieldType;
  required: boolean;
  /** Only meaningful when answerFieldType is 'choice'. */
  options: string[] | null;
}

/**
 * The submission_answer.value jsonb shape. A fieldType-discriminated
 * union with an envelope on top (StoredAnswer) rather than a bare value,
 * because:
 *  - `requirementId` is denormalised in even though the column doesn't
 *    exist on submission_answer — the row is otherwise only reachable via
 *    a two-hop join, and a self-describing record survives the
 *    requirement itself being deleted later.
 *  - `choice` snapshots the options as offered, same immutability
 *    principle that makes `requirement` a snapshot of
 *    `requirement_definition` — if the template's options change later,
 *    the record still shows what the recipient actually saw.
 *  - `acknowledge` snapshots the rendered statement, because evidence of
 *    what was agreed to is the entire point; a bare `true` is worthless.
 *  - `date` is a string, never a Date/timestamp: `new Date('2026-03-01')`
 *    is UTC midnight and renders as Feb 28 west of Greenwich. A calendar
 *    date is not an instant.
 */
export type AnswerValue =
  | { fieldType: 'short_text'; text: string }
  | { fieldType: 'long_text'; text: string }
  | { fieldType: 'date'; date: string } // 'YYYY-MM-DD'
  | { fieldType: 'choice'; choice: string; options: string[] }
  | { fieldType: 'yes_no'; yes: boolean }
  | { fieldType: 'acknowledge'; acknowledged: true; statement: string }
  | { fieldType: 'not_applicable'; declaredBy: 'party' };

export type StoredAnswer = AnswerValue & { requirementId: string; answeredAt: string };

export type ValidateAnswerResult = { ok: true; value: AnswerValue } | { ok: false; message: string };

const SHORT_TEXT_MAX = 200;
const LONG_TEXT_MAX = 5000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MIN_DATE = new Date(Date.UTC(1900, 0, 1));
const MAX_DATE_YEARS_FROM_NOW = 100;

/**
 * True calendar-date validity, not just pattern matching: rejects
 * 2026-02-30 and 2026-02-29 (2026 isn't a leap year) while accepting
 * 2028-02-29. `new Date(y, m-1, d)` silently rolls an invalid day into
 * the next month (e.g. Feb 30 -> Mar 2), so round-tripping the parts and
 * comparing catches exactly that rollover.
 */
function isValidCalendarDate(raw: string): boolean {
  if (!DATE_PATTERN.test(raw)) return false;
  const [yStr, mStr, dStr] = raw.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  const parsed = new Date(Date.UTC(y, m - 1, d));
  if (parsed.getUTCFullYear() !== y || parsed.getUTCMonth() !== m - 1 || parsed.getUTCDate() !== d) {
    return false;
  }
  const maxDate = new Date();
  maxDate.setUTCFullYear(maxDate.getUTCFullYear() + MAX_DATE_YEARS_FROM_NOW);
  return parsed >= MIN_DATE && parsed <= maxDate;
}

/**
 * An empty answer is never valid, required or not — deliberately no
 * "optional fields may be left blank" carve-out here. Blank string and
 * "doesn't apply" are different claims (product.md §4.1's "confirm that
 * an item does not apply"), and the recipient page gives optional
 * requirements an explicit "This doesn't apply to me" control for the
 * second one (a separate action, not this function). Collapsing the two
 * into "empty string means N/A" would lose that distinction.
 */
function emptyMessage(required: boolean): string {
  return required
    ? 'This field is required.'
    : "This field can't be left blank — answer it, or use \"This doesn't apply to me\".";
}

export function validateAnswer(requirement: AnswerableRequirement, raw: string): ValidateAnswerResult {
  switch (requirement.answerFieldType) {
    case 'short_text':
    case 'long_text': {
      const text = raw.trim();
      if (!text) return { ok: false, message: emptyMessage(requirement.required) };
      const max = requirement.answerFieldType === 'short_text' ? SHORT_TEXT_MAX : LONG_TEXT_MAX;
      if (text.length > max) {
        return { ok: false, message: `Please keep this to ${max} characters or fewer.` };
      }
      return { ok: true, value: { fieldType: requirement.answerFieldType, text } };
    }

    case 'date': {
      const trimmed = raw.trim();
      if (!trimmed) return { ok: false, message: emptyMessage(requirement.required) };
      if (!isValidCalendarDate(trimmed)) {
        return { ok: false, message: 'Please enter a valid date.' };
      }
      return { ok: true, value: { fieldType: 'date', date: trimmed } };
    }

    case 'choice': {
      const options = requirement.options;
      if (!options || options.length === 0) {
        return {
          ok: false,
          message: "This question isn't configured correctly — contact the sender.",
        };
      }
      const choice = raw.trim();
      if (!choice) return { ok: false, message: emptyMessage(requirement.required) };
      if (!options.includes(choice)) {
        return { ok: false, message: 'Please choose one of the listed options.' };
      }
      return { ok: true, value: { fieldType: 'choice', choice, options } };
    }

    case 'yes_no': {
      const trimmed = raw.trim();
      if (!trimmed) return { ok: false, message: emptyMessage(requirement.required) };
      if (trimmed !== 'yes' && trimmed !== 'no') {
        return { ok: false, message: 'Please choose Yes or No.' };
      }
      return { ok: true, value: { fieldType: 'yes_no', yes: trimmed === 'yes' } };
    }

    default: {
      // Exhaustiveness guard — TypeScript already narrows the union above
      // to `never` here; this only fires if the enum is widened later
      // without updating this function.
      const exhaustive: never = requirement.answerFieldType;
      return { ok: false, message: `Unsupported answer type: ${String(exhaustive)}` };
    }
  }
}

/** Type guard for reading the untyped submission_answer.value jsonb back out. */
export function isStoredAnswer(v: unknown): v is StoredAnswer {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o.requirementId !== 'string' || typeof o.answeredAt !== 'string') return false;

  switch (o.fieldType) {
    case 'short_text':
    case 'long_text':
      return typeof o.text === 'string';
    case 'date':
      return typeof o.date === 'string';
    case 'choice':
      return (
        typeof o.choice === 'string' &&
        Array.isArray(o.options) &&
        o.options.every((x) => typeof x === 'string')
      );
    case 'yes_no':
      return typeof o.yes === 'boolean';
    case 'acknowledge':
      return o.acknowledged === true && typeof o.statement === 'string';
    case 'not_applicable':
      return o.declaredBy === 'party';
    default:
      return false;
  }
}
