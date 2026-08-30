import Link from 'next/link';
import { Saira_Extra_Condensed } from 'next/font/google';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

/**
 * The logo font — Saira Extra Condensed Bold, per design-revised.md §15.
 * Scoped to this file's usage only; never apply this to headings,
 * buttons, or body copy elsewhere.
 */
const logoFont = Saira_Extra_Condensed({
  subsets: ['latin'],
  weight: '700',
  display: 'swap',
});

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 px-6 text-center">
      <Card className="px-10 py-12">
        {/* Logo wordmark is always uppercase — "GATHER", never "Gather" — per design-revised.md §15. */}
        <h1 className={`${logoFont.className} text-headline-large tracking-[-0.01em] text-md-primary`}>
          GATHER
        </h1>
        <p className="mt-3 text-body-large text-md-on-surface-variant">
          Close every client&apos;s month without chasing them.
        </p>

        <div className="mt-8 flex items-center justify-center gap-3">
          <Link href="/sign-up">
            <Button variant="filled">Create your workspace</Button>
          </Link>
          <Link href="/sign-in">
            <Button variant="text">Sign in</Button>
          </Link>
        </div>
      </Card>
    </main>
  );
}
