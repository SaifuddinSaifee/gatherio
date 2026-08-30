import Link from 'next/link';
import { MdLogin, MdPersonAdd } from 'react-icons/md';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/ui/logo';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 px-6 text-center">
      <Card className="px-10 py-12">
        <h1>
          <Logo className="text-headline-large" />
        </h1>
        <p className="mt-3 text-body-large text-md-on-surface-variant">
          Close every client&apos;s month without chasing them.
        </p>

        <div className="mt-8 flex items-center justify-center gap-3">
          <Link href="/sign-up">
            <Button variant="filled">
              <MdPersonAdd aria-hidden="true" className="h-4.5 w-4.5" />
              Create your workspace
            </Button>
          </Link>
          <Link href="/sign-in">
            <Button variant="text">
              <MdLogin aria-hidden="true" className="h-4.5 w-4.5" />
              Sign in
            </Button>
          </Link>
        </div>
      </Card>
    </main>
  );
}
