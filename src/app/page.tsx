import { Saira_Extra_Condensed } from 'next/font/google';

/**
 * The logo font — Saira Extra Condensed Bold, per design.md's Logo &
 * Wordmark section. Scoped to this file's usage only; never apply this
 * to headings, buttons, or body copy elsewhere. Weight 700 is the only
 * weight the wordmark uses.
 */
const logoFont = Saira_Extra_Condensed({
  subsets: ['latin'],
  weight: '700',
  display: 'swap',
});

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="rounded-md-3xl bg-md-surface-container px-10 py-12 shadow-sm">
        {/* Logo wordmark is always uppercase — "GATHER", never "Gather" — per design.md. */}
        <h1 className={`${logoFont.className} text-6xl tracking-[-0.01em] text-md-primary`}>
          GATHER
        </h1>
        <p className="mt-3 text-md-on-surface-variant">
          Close every client&apos;s month without chasing them.
        </p>
        <p className="mt-6 text-sm text-md-on-surface-variant">
          Foundations stage — requester dashboard and recipient links are next.
        </p>
      </div>
    </main>
  );
}
