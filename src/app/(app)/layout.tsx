import { redirect } from 'next/navigation';
import { getCurrentSession } from '@/db/session';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getCurrentSession();
  if (!session) redirect('/sign-in');

  return <>{children}</>;
}
