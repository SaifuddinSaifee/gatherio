export default async function RecipientPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <main className="mx-auto max-w-lg px-4 py-10">
      <div className="rounded-md-lg bg-md-surface-container p-6 shadow-sm">
        <h1 className="text-xl font-medium text-md-on-background">Outstanding items</h1>
        <p className="mt-2 text-sm text-md-on-surface-variant">
          Recipient page — built in Stage 6. Token: <code>{token}</code>
        </p>
      </div>
    </main>
  );
}
