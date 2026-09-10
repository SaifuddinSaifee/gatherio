import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { MdCheckCircle, MdExpandMore } from 'react-icons/md';
import { assertTokenStillValid } from '@/db/party-session';
import { recipientCookieName, verifyRecipientCookie } from '@/lib/recipient-cookie';
import { getRecipientView } from '@/lib/domain/recipient-view';
import { partitionItems } from '@/lib/domain/recipient';
import { Logo } from '@/components/ui/logo';
import { ViewedBeacon } from './viewed-beacon';
import { OutstandingItem } from './outstanding-item';
import { CompletedItem } from './completed-item';

/**
 * The recipient page — the only surface most users of this product ever
 * see (§6: it deserves disproportionate engineering effort). Everything
 * here is a plain server component except the small named islands
 * (ViewedBeacon, AnswerField, UploadField, AcknowledgeControl,
 * NotApplicableControl); the completed section is a native <details>
 * with zero JavaScript.
 *
 * This page never sees the raw magic-link token — only our own signed
 * cookie, set by /r/[token]/route.ts's one-hop redirect. It re-validates
 * that cookie against the live access_token row on every load (not just
 * trusting a session that could have been revoked since it was minted).
 */
export default async function RecipientCasePage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;

  const cookieStore = await cookies();
  const raw = cookieStore.get(recipientCookieName(caseId))?.value;
  if (!raw) redirect('/r/expired?reason=not_found');

  const verified = verifyRecipientCookie(raw);
  if (!verified.ok || verified.payload.caseId !== caseId) {
    redirect('/r/expired?reason=not_found');
  }

  const stillValid = await assertTokenStillValid(verified.payload.accessTokenId);
  if (!stillValid.ok) redirect(`/r/expired?reason=${stillValid.reason}`);

  const view = await getRecipientView({
    accessTokenId: verified.payload.accessTokenId,
    workspaceId: verified.payload.workspaceId,
    caseId: verified.payload.caseId,
    partyId: verified.payload.partyId,
  });
  if (!view) redirect('/r/expired?reason=not_found');

  const { outstanding, completed } = partitionItems(view.items);
  const doneCount = view.items.length - outstanding.length;

  return (
    <main className="mx-auto max-w-lg px-4 py-6">
      <ViewedBeacon caseId={caseId} />

      <header className="mb-6">
        <Logo className="text-title-medium" />
        <h1 className="mt-3 text-headline-small font-medium text-md-on-surface">{view.case.name}</h1>
        <p className="mt-1 text-body-medium text-md-on-surface-variant">
          {doneCount} of {view.items.length} done
          {view.case.dueAt && ` · due ${view.case.dueAt.toLocaleDateString()}`}
        </p>
      </header>

      <noscript>
        <p className="mb-6 rounded-sm bg-md-error-container px-4 py-2 text-body-small text-md-on-error-container">
          File uploads need JavaScript enabled. Answers and acknowledgements work without it.
        </p>
      </noscript>

      {outstanding.length === 0 && completed.length > 0 && (
        <p className="mb-6 flex items-center gap-2 rounded-sm bg-md-secondary-container px-4 py-3 text-body-medium text-md-on-secondary-container">
          <MdCheckCircle aria-hidden="true" className="h-5 w-5 shrink-0" />
          Everything is submitted. Thank you.
        </p>
      )}

      {outstanding.length > 0 && (
        <section aria-labelledby="outstanding-heading">
          <h2 id="outstanding-heading" className="text-title-medium text-md-on-surface">
            Outstanding ({outstanding.length})
          </h2>
          <ul className="mt-3 flex flex-col divide-y divide-md-outline-variant">
            {outstanding.map((item) => (
              <li key={item.requirement.id} className="py-4 first:pt-0">
                <OutstandingItem caseId={caseId} item={item} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {completed.length > 0 && (
        <details className="group mt-8">
          <summary className="flex cursor-pointer list-none items-center gap-1 text-title-medium text-md-on-surface [&::-webkit-details-marker]:hidden">
            <MdExpandMore
              aria-hidden="true"
              className="h-5 w-5 transition-transform duration-(--duration-effects-fast) group-open:rotate-180"
            />
            Completed ({completed.length})
          </summary>
          <ul className="mt-3 flex flex-col divide-y divide-md-outline-variant">
            {completed.map((item) => (
              <li key={item.requirement.id} className="py-4 first:pt-0">
                <CompletedItem caseId={caseId} item={item} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </main>
  );
}
