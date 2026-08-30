import Link from 'next/link';
import { TextField } from '@/components/ui/text-field';
import { signInAction } from './actions';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <div className="rounded-md-lg bg-md-surface-container p-8 shadow-sm">
        <h1 className="text-2xl font-medium text-md-on-background">Sign in</h1>

        {error && (
          <p className="mt-4 rounded-md-sm bg-md-tertiary/10 px-4 py-2 text-sm text-md-tertiary">
            {error}
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

          <button
            type="submit"
            className="mt-2 h-11 rounded-full bg-md-primary px-6 text-sm font-medium text-md-on-primary transition-all duration-300 ease-md-standard hover:bg-md-primary/90 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-md-primary focus-visible:ring-offset-2 active:scale-95 active:bg-md-primary/80"
          >
            Sign in
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-md-on-surface-variant">
          New here?{' '}
          <Link href="/sign-up" className="text-md-primary hover:underline">
            Create a workspace
          </Link>
        </p>
      </div>
    </main>
  );
}
