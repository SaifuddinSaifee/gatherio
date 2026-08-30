import Link from 'next/link';
import { Logo } from '@/components/ui/logo';
import { Button } from '@/components/ui/button';
import { signOutAction } from '@/app/(app)/actions';

/**
 * Shared nav shell for every authenticated (app) page. Kept deliberately
 * plain — a title, three links, sign out — until Stage 9 gives the
 * dashboard enough surface area to justify a real navigation pattern
 * (design-revised.md §42 chooses nav pattern by information architecture
 * and viewport, not preemptively).
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
      <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-6">
          <Link href="/dashboard">
            <Logo className="text-title-large" />
          </Link>
          <nav className="flex items-center gap-4 text-label-large">
            <Link href="/dashboard" className="text-md-on-surface-variant hover:text-md-on-surface">
              Cases
            </Link>
            <Link href="/templates" className="text-md-on-surface-variant hover:text-md-on-surface">
              Templates
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <span data-testid="workspace-name" className="text-body-small text-md-on-surface-variant">
            {workspaceName}
            {role && ` · ${role}`}
          </span>
          <form action={signOutAction}>
            <Button type="submit" variant="text">
              Sign out
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
