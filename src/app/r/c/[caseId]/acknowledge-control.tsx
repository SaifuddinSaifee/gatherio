'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { acknowledgeAction } from './actions';
import { initialAnswerFormState } from './answer-form-state';

/** Statement text is rendered server-side (page.tsx) from the requirement's own title/instructions — never accepted from the client, since evidence of what was agreed to is the whole point of an acknowledgement. */
export function AcknowledgeControl({
  caseId,
  assignmentId,
  statement,
}: {
  caseId: string;
  assignmentId: string;
  statement: string;
}) {
  const [state, formAction, isPending] = useActionState(acknowledgeAction, initialAnswerFormState);

  return (
    <form action={formAction} className="mt-3 flex flex-col items-start gap-3">
      <input type="hidden" name="caseId" value={caseId} />
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <p className="text-body-medium text-md-on-surface-variant">{statement}</p>
      <Button type="submit" variant="tonal" disabled={isPending} className="h-12">
        {isPending ? 'Recording…' : 'I acknowledge this'}
      </Button>
      {state.error && (
        <p role="alert" className="text-body-small text-md-error">
          Error: {state.error}
        </p>
      )}
    </form>
  );
}
