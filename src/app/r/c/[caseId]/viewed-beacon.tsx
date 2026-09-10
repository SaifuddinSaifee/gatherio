'use client';

import { useEffect } from 'react';
import { markViewedAction } from './actions';

/**
 * The whole reason a GET can stay write-free (§4.7): a mail scanner
 * fetches this page's HTML but never executes JavaScript, so it never
 * runs this effect. A real recipient's browser does, once, on mount —
 * that's the earliest evidence Gather is willing to claim someone
 * actually opened their case. StrictMode's dev-only double-invoke is
 * harmless: markViewedAction is idempotent.
 */
export function ViewedBeacon({ caseId }: { caseId: string }) {
  useEffect(() => {
    void markViewedAction(caseId);
  }, [caseId]);

  return null;
}
