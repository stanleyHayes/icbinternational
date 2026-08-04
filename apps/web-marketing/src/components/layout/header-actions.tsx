'use client';

import { Menu, X } from 'lucide-react';

import { cn, FOCUS_RING } from '@reliance/ui';

import { ExternalLinkButton, LinkButton } from '@/components/marketing/link-button';
import { APP_URL } from '@/content/site';

import { ThemeToggle } from './theme-toggle';

const ICON_SIZE = 20;

/** Everything on the right of the header: appearance, log in, apply, and the menu button. */
export function HeaderActions({
  mobileOpen,
  onToggleMobile,
}: {
  readonly mobileOpen: boolean;
  readonly onToggleMobile: () => void;
}) {
  return (
    <div className="ml-auto flex items-center gap-2">
      <div className="hidden md:block">
        <ThemeToggle />
      </div>

      <ExternalLinkButton
        href={APP_URL}
        variant="ghost"
        size="sm"
        className="hidden sm:inline-flex"
      >
        Log in
      </ExternalLinkButton>

      <LinkButton href="/open-an-account" size="sm" className="hidden sm:inline-flex">
        Open an account
      </LinkButton>

      <button
        type="button"
        aria-expanded={mobileOpen}
        aria-controls="mobile-navigation"
        aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
        onClick={onToggleMobile}
        className={cn(
          'text-fg hover:bg-surface-sunken grid size-10 place-items-center rounded-md lg:hidden',
          FOCUS_RING,
        )}
      >
        {mobileOpen ? <X size={ICON_SIZE} aria-hidden /> : <Menu size={ICON_SIZE} aria-hidden />}
      </button>
    </div>
  );
}
