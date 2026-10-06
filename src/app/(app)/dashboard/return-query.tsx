'use client';

import { createContext, useContext } from 'react';

/** The dashboard's current search/filter/sort/page query, so a reminder sent from a card returns to the same view state. */
export const ReturnQueryContext = createContext('');

export function ReturnQueryInput() {
  return <input type="hidden" name="returnQuery" value={useContext(ReturnQueryContext)} />;
}
