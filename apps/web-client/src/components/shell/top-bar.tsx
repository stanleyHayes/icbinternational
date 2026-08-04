'use client';

/**
 * The bar across the top of every application screen.
 *
 * Sticky, because the account switcher and the notification bell are the two controls a customer
 * reaches for from halfway down a transaction list. The right-hand group is a labelled toolbar, so
 * the whole strip can be reached as one landmark rather than as four loose buttons.
 */

import { Menu } from 'lucide-react';
import { useState } from 'react';

import { Button, Drawer } from '@reliance/ui';

import { AccountSwitcher } from './account-switcher';
import { NotificationBell } from './notification-bell';
import { SearchTrigger } from './search-trigger';
import { SidebarNav } from './sidebar';
import { SidebarFooter } from './sidebar-footer';

/** Application header: navigation menu on small screens, account controls on all of them. */
export function TopBar() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="border-border bg-surface/95 sticky top-0 z-30 border-b backdrop-blur">
      <div className="flex h-16 items-center gap-2 px-4 sm:px-6">
        <Button
          variant="ghost"
          iconOnly
          aria-label="Open the menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(true)}
          className="lg:hidden"
        >
          <Menu aria-hidden="true" className="size-5" />
        </Button>

        <AccountSwitcher />

        <div className="flex-1" />

        <div role="toolbar" aria-label="Account controls" className="flex items-center gap-1">
          <SearchTrigger />
          <NotificationBell />
        </div>
      </div>

      <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} title="Menu" side="left">
        <div className="flex h-full flex-col justify-between gap-6">
          <SidebarNav onNavigate={() => setMenuOpen(false)} />
          <SidebarFooter />
        </div>
      </Drawer>
    </header>
  );
}
