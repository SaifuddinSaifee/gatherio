import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { TextField } from '@/components/ui/text-field';
import { Button } from '@/components/ui/button';
import { signInAction } from './actions';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <Card className="p-8">
        <h1 className="text-title-large font-medium text-md-on-surface">Sign in</h1>

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-sm bg-md-error-container px-4 py-2 text-body-small text-md-on-error-container"
          >
            Error: {error}
          </p>
        )}

        <form action={signInAction} className="mt-6 flex flex-col gap-4">
          <TextField
            label="Work email"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
          <TextField
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />

          <Button type="submit" variant="filled" fullWidth className="mt-2">
            Sign in
          </Button>
        </form>

        <p className="mt-6 text-center text-body-small text-md-on-surface-variant">
          New here?{' '}
          <Link href="/sign-up" className="text-md-primary hover:underline">
            Create a workspace
          </Link>
        </p>
      </Card>
    </main>
  );
}
