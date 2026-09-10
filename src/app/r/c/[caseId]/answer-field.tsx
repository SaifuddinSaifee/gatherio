'use client';

import { useActionState, useState, useTransition, type ChangeEvent } from 'react';
import { TextField } from '@/components/ui/text-field';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { validateAnswer, type AnswerFieldType } from '@/lib/domain/answer';
import { saveAnswerDraftAction, submitAnswerAction } from './actions';
import { initialAnswerFormState } from './answer-form-state';

interface AnswerFieldProps {
  caseId: string;
  assignmentId: string;
  answerFieldType: AnswerFieldType;
  required: boolean;
  options: string[] | null;
  initialValue: string;
}

/**
 * Backs short_text/long_text/date/choice/yes_no. The `<form
 * action={formAction}>` here is a REAL form pointed at a server action —
 * it submits and re-renders correctly with JavaScript disabled (Next
 * handles the native POST). Everything below beyond that native
 * behaviour — draft-on-blur, instant inline validation — is additive,
 * not load-bearing for the no-JS path.
 */
export function AnswerField({
  caseId,
  assignmentId,
  answerFieldType,
  required,
  options,
  initialValue,
}: AnswerFieldProps) {
  const [value, setValue] = useState(initialValue);
  const [clientError, setClientError] = useState<string | null>(null);
  const [state, formAction, isPending] = useActionState(submitAnswerAction, initialAnswerFormState);
  const [, startTransition] = useTransition();

  function handleBlur() {
    const result = validateAnswer({ answerFieldType, required, options }, value);
    setClientError(result.ok ? null : result.message);
    startTransition(() => {
      void saveAnswerDraftAction({ caseId, assignmentId, actionType: 'answer', value });
    });
  }

  function handleChange(next: string) {
    setValue(next);
    if (clientError) setClientError(null);
  }

  const errorMessage = clientError ?? state.error ?? undefined;

  return (
    <form action={formAction} className="mt-3 flex flex-col items-start gap-3">
      <input type="hidden" name="caseId" value={caseId} />
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <div className="w-full">{renderControl()}</div>
      <Button type="submit" variant="tonal" disabled={isPending} className="h-12">
        {isPending ? 'Saving…' : 'Save answer'}
      </Button>
    </form>
  );

  function renderControl() {
    switch (answerFieldType) {
      case 'short_text':
        return (
          <TextField
            label="Your answer"
            name="value"
            value={value}
            maxLength={200}
            required={required}
            errorMessage={errorMessage}
            onChange={(e: ChangeEvent<HTMLInputElement>) => handleChange(e.target.value)}
            onBlur={handleBlur}
          />
        );

      case 'long_text':
        return (
          <label className="block">
            <span className="mb-1 block text-body-small text-md-on-surface-variant">Your answer</span>
            <textarea
              name="value"
              value={value}
              maxLength={5000}
              required={required}
              rows={4}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => handleChange(e.target.value)}
              onBlur={handleBlur}
              className="w-full rounded-t-xs border-b-2 border-md-outline bg-md-surface-container-low px-4 py-3 text-body-large text-md-on-surface outline-none transition-colors duration-(--duration-effects-default) focus:border-md-primary focus-visible:ring-2 focus-visible:ring-md-primary focus-visible:ring-offset-2"
            />
            {errorMessage && (
              <p className="mt-1 text-body-small text-md-error">Error: {errorMessage}</p>
            )}
          </label>
        );

      case 'date':
        return (
          <TextField
            label="Your answer"
            name="value"
            type="date"
            value={value}
            required={required}
            errorMessage={errorMessage}
            onChange={(e: ChangeEvent<HTMLInputElement>) => handleChange(e.target.value)}
            onBlur={handleBlur}
          />
        );

      case 'choice':
        return (
          <Select
            label="Choose one"
            name="value"
            value={value}
            required={required}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => {
              handleChange(e.target.value);
              handleBlurNow(e.target.value);
            }}
          >
            <option value="" disabled>
              Choose one…
            </option>
            {(options ?? []).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        );

      case 'yes_no':
        return (
          <fieldset>
            <legend className="mb-1 text-body-small text-md-on-surface-variant">Your answer</legend>
            <div className="flex gap-6">
              {(['yes', 'no'] as const).map((option) => (
                <label
                  key={option}
                  className="flex min-h-12 items-center gap-2 text-body-medium text-md-on-surface"
                >
                  <input
                    type="radio"
                    name="value"
                    value={option}
                    checked={value === option}
                    required={required}
                    onChange={() => {
                      handleChange(option);
                      handleBlurNow(option);
                    }}
                    className="h-5 w-5 accent-md-primary"
                  />
                  {option === 'yes' ? 'Yes' : 'No'}
                </label>
              ))}
            </div>
            {errorMessage && (
              <p className="mt-1 text-body-small text-md-error">Error: {errorMessage}</p>
            )}
          </fieldset>
        );
    }
  }

  // Select/radio inputs don't fire a meaningful blur on the value that
  // matters (the click already changed it) — save the draft on the
  // change itself instead, using the value being set rather than
  // whatever's still in state at call time.
  function handleBlurNow(next: string) {
    const result = validateAnswer({ answerFieldType, required, options }, next);
    setClientError(result.ok ? null : result.message);
    startTransition(() => {
      void saveAnswerDraftAction({ caseId, assignmentId, actionType: 'answer', value: next });
    });
  }
}
