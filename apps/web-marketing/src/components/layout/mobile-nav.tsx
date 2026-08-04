'use client';

import Link from 'next/link';

import { cn, FOCUS_RING } from '@reliance/ui';

import { ExternalLinkButton, LinkButton } from '@/components/marketing/link-button';
import { NAV_SECTIONS, type NavSection } from '@/content/navigation';
import { APP_URL } from '@/content/site';

import { ThemeToggle } from './theme-toggle';

/**
 * The small-screen menu.
 *
 * Every section is expanded rather than collapsed behind an accordion. The whole site is
 * twenty-odd pages; hiding half of them behind a second tap buys nothing and costs a
 * screen-reader user an extra layer to walk through.
 */
export function MobileNav({
  open,
  onNavigate,
}: {
  readonly open: boolean;
  readonly onNavigate: () => void;
}) {
  if (!open) return null;

  return (
    <div
      id="mobile-navigation"
      className="border-border bg-surface max-h-[calc(100dvh-4rem)] overflow-y-auto border-t lg:hidden"
    >
      <nav aria-label="Main" className="rb-shell py-6">
        <ul className="space-y-6">
          {NAV_SECTIONS.map((section) => (
            <MobileSection key={section.id} section={section} onNavigate={onNavigate} />
          ))}
        </ul>
        <MobileActions />
      </nav>
    </div>
  );
}

function MobileSection({
  section,
  onNavigate,
}: {
  readonly section: NavSection;
  readonly onNavigate: () => void;
}) {
  return (
    <li>
      <h2 className="text-fg-subtle text-xs font-semibold tracking-widest uppercase">
        {section.label}
      </h2>
      <ul className="mt-2 space-y-0.5">
        {section.links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              onClick={onNavigate}
              className={cn(
                'text-fg hover:bg-surface-sunken block rounded-md px-2 py-2.5',
                FOCUS_RING,
              )}
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </li>
  );
}

function MobileActions() {
  return (
    <div className="border-border mt-8 flex flex-col gap-3 border-t pt-6">
      <LinkButton href="/open-an-account" size="lg" fullWidth>
        Open an account
      </LinkButton>
      <ExternalLinkButton href={APP_URL} variant="secondary" size="lg" className="w-full">
        Log in
      </ExternalLinkButton>
      <div className="flex items-center justify-between pt-2">
        <span className="text-fg-muted text-sm">Appearance</span>
        <ThemeToggle />
      </div>
    </div>
  );
}
