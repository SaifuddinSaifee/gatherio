'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getCurrentSession } from '@/db/session';
import {
  DASHBOARD_PREF_MAX_AGE_SECONDS,
  DASHBOARD_VIEW_COOKIE,
  parseDashboardView,
} from '@/lib/dashboard-prefs';

/** Remembers the chosen dashboard view in this browser (Stage 8.6 decision 1). */
export async function setDashboardViewAction(view: string): Promise<void> {
  const session = await getCurrentSession();
  if (!session) redirect('/sign-in');

  const cookieStore = await cookies();
  cookieStore.set(DASHBOARD_VIEW_COOKIE, parseDashboardView(view), {
    path: '/',
    maxAge: DASHBOARD_PREF_MAX_AGE_SECONDS,
    sameSite: 'lax',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
  });

  redirect('/dashboard');
}
