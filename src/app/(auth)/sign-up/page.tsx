import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { TextField } from '@/components/ui/text-field';
import { Button } from '@/components/ui/button';
import { signUpAction } from './actions';

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <Card className="p-8">
        <h1 className="text-title-large font-medium text-md-on-surface">Create your workspace</h1>
        <p className="mt-1 text-body-medium text-md-on-surface-variant">
          One account for your practice. Your clients never need one.
        </p>

        {/* Form-level error, not tied to one field — uses the Error color
            family (design-revised.md §8) and a text prefix so color isn't
            the only indicator (§39, §72). role="alert" announces it to
            screen readers without requiring focus. */}
        {error && (
          <p
            role="alert"
            className="mt-4 rounded-sm bg-md-error-container px-4 py-2 text-body-small text-md-on-error-container"
          >
            Error: {error}
          </p>
        )}

        <form action={signUpAction} className="mt-6 flex flex-col gap-4">
          <TextField label="Your name" name="name" type="text" autoComplete="name" required />
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
            autoComplete="new-password"
            minLength={8}
            required
          />
          <TextField
            label="Workspace name"
            name="workspaceName"
            type="text"
            placeholder="e.g. Acme Tax Advisors"
          />

          <Button type="submit" variant="filled" fullWidth className="mt-2">
            Create account
          </Button>
        </form>

        <p className="mt-6 text-center text-body-small text-md-on-surface-variant">
          Already have an account?{' '}
          <Link href="/sign-in" className="text-md-primary hover:underline">
            Sign in
          </Link>
        </p>
      </Card>
    </main>
  );
}
