import { MdLinkOff } from 'react-icons/md';
import { Card } from '@/components/ui/card';

const REASON_COPY: Record<string, string> = {
  not_found: "This link doesn't work. Double-check it against the one in your email, or ask the sender to resend it.",
  expired: 'This link has expired. Ask the sender to resend it.',
  revoked: 'This link is no longer active. Ask the sender for a new one.',
};

const DEFAULT_COPY = 'This link is no longer valid. Ask the sender for a new one.';

/**
 * Where /r/[token]/route.ts sends a request it couldn't resolve. Never a
 * bare 404 — the requester's own case still exists, only this specific
 * link doesn't work, and the recipient has no dashboard to fall back to
 * (the whole point of the product is that they never needed one).
 */
export default async function ExpiredLinkPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const message = (reason && REASON_COPY[reason]) || DEFAULT_COPY;

  return (
    <main className="mx-auto max-w-lg px-4 py-16">
      <Card className="text-center">
        <MdLinkOff aria-hidden="true" className="mx-auto h-8 w-8 text-md-on-surface-variant" />
        <h1 className="mt-3 text-title-large font-medium text-md-on-surface">Link not available</h1>
        <p className="mt-2 text-body-medium text-md-on-surface-variant">{message}</p>
      </Card>
    </main>
  );
}
