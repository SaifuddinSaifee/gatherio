'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { declareNotApplicableAction } from './actions';
import { initialAnswerFormState } from './answer-form-state';

/** Only rendered for optional requirements (page.tsx checks !required). Distinct from submitting an empty answer — see answer.ts's emptyMessage for why the two aren't the same claim. */
export function NotApplicableControl({ caseId, assignmentId }: { caseId: string; assignmentId: string }) {
  const [state, formAction, isPending] = useActionState(declareNotApplicableAction, initialAnswerFormState);

  return (
    <form action={formAction}>
      <input type="hidden" name="caseId" value={caseId} />
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <Button type="submit" variant="text" disabled={isPending} className="h-10 text-md-on-surface-variant">
        {isPending ? 'Saving…' : "This doesn't apply to me"}
      </Button>
      {state.error && (
        <p role="alert" className="mt-1 text-body-small text-md-error">
          Error: {state.error}
        </p>
      )}
    </form>
  );
}
