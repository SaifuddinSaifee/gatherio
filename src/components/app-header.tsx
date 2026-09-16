import Link from 'next/link';
import { MdLogout } from 'react-icons/md';
import { Logo } from '@/components/ui/logo';
import { Button } from '@/components/ui/button';
import { AppNav } from '@/components/app-nav';
import { signOutAction } from '@/app/(app)/actions';

/**
 * Shared nav shell for every authenticated (app) page. Rendered once from
 * `(app)/layout.tsx` so it persists across navigation between routes
 * instead of remounting per page (Stage 8.5).
 */
export function AppHeader({
  workspaceName,
  role,
}: {
  workspaceName: string;
  role?: 'owner' | 'member';
}) {
  return (
    <header className="border-b border-md-outline-variant bg-md-surface">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-6">
          <Link href="/dashboard">
            <Logo className="text-headline-medium" />
          </Link>
          <AppNav />
        </div>

        <div className="flex items-center gap-3">
          <span data-testid="workspace-name" className="text-body-small text-md-on-surface-variant">
            {workspaceName}
            {role && ` · ${role}`}
          </span>
          <form action={signOutAction}>
            <Button type="submit" variant="text">
              <MdLogout aria-hidden="true" className="h-4.5 w-4.5" />
              Sign out
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
