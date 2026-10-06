'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MdChecklist, MdDescription } from 'react-icons/md';
import type { IconType } from 'react-icons';
import { cn } from '@/lib/cn';

const NAV_ITEMS: {
  href: '/dashboard' | '/templates';
  label: string;
  icon: IconType;
  isActive: (pathname: string) => boolean;
}[] = [
  {
    href: '/dashboard',
    label: 'Cases',
    icon: MdChecklist,
    isActive: (pathname) => pathname === '/dashboard' || pathname.startsWith('/cases'),
  },
  {
    href: '/templates',
    label: 'Templates',
    icon: MdDescription,
    isActive: (pathname) => pathname.startsWith('/templates'),
  },
];

/** Client boundary so the active tab can read the route (`usePathname`) without forcing the rest of `AppHeader` off the server. */
export function AppNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1 text-label-large">
      {NAV_ITEMS.map(({ href, label, icon: Icon, isActive }) => {
        const active = isActive(pathname);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-1.5 rounded-sm px-3 py-1.5 transition-colors duration-(--duration-effects-fast)',
              active
                ? 'bg-md-secondary-container text-md-on-secondary-container'
                : 'text-md-on-surface-variant hover:bg-md-surface-container-high hover:text-md-on-surface',
            )}
          >
            <Icon aria-hidden="true" className="h-4.5 w-4.5" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
