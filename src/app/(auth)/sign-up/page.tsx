import Link from 'next/link';
import { TextField } from '@/components/ui/text-field';
import { signUpAction } from './actions';

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <div className="rounded-md-lg bg-md-surface-container p-8 shadow-sm">
        <h1 className="text-2xl font-medium text-md-on-background">Create your workspace</h1>
        <p className="mt-1 text-sm text-md-on-surface-variant">
          One account for your practice. Your clients never need one.
        </p>

        {error && (
          <p className="mt-4 rounded-md-sm bg-md-tertiary/10 px-4 py-2 text-sm text-md-tertiary">
            {error}
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

          <button
            type="submit"
            className="mt-2 h-11 rounded-full bg-md-primary px-6 text-sm font-medium text-md-on-primary transition-all duration-300 ease-md-standard hover:bg-md-primary/90 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-md-primary focus-visible:ring-offset-2 active:scale-95 active:bg-md-primary/80"
          >
            Create account
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-md-on-surface-variant">
          Already have an account?{' '}
          <Link href="/sign-in" className="text-md-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
