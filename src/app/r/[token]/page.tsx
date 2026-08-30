import { Card } from '@/components/ui/card';

export default async function RecipientPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <main className="mx-auto max-w-lg px-4 py-10">
      <Card>
        <h1 className="text-title-large font-medium text-md-on-surface">Outstanding items</h1>
        <p className="mt-2 text-body-medium text-md-on-surface-variant">
          Recipient page — built in Stage 6. Token: <code>{token}</code>
        </p>
      </Card>
    </main>
  );
}
