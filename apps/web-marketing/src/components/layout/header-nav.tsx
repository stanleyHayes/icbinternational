'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

import { cn, FOCUS_RING } from '@reliance/ui';

import { NAV_SECTIONS } from '@/content/navigation';

import { HeaderActions } from './header-actions';
import { Logo } from './logo';
import { MegaMenuPanel } from './mega-menu-panel';
import { MobileNav } from './mobile-nav';
import { PrimaryNav, type RegisterTrigger } from './primary-nav';
import { useMenuDismiss } from './use-menu-dismiss';

const ESCAPE_KEY = 'Escape';
const LOGO_HEIGHT = 30;

interface EscapeFocusOptions {
  readonly containerRef: RefObject<HTMLElement | null>;
  readonly openSection: string | null;
}

/**
 * Escape closes the open panel and puts focus back on the trigger that opened it.
 *
 * Without this the panel unmounts with focus still inside it, the browser drops focus to `<body>`,
 * and the customer's next Tab restarts at the top of the document rather than continuing from the
 * menu they just dismissed. The focus call waits for the commit that removed the panel, because
 * focusing an element mid-render is not the same as focusing the one on screen.
 *
 * Only an Escape pressed while focus is *inside* the header returns it. Dismissing by clicking
 * elsewhere or by tabbing away means the customer has already chosen where they are, and moving
 * them back would undo that choice — which is why this is not folded into `useMenuDismiss`.
 */
function useEscapeFocus({ containerRef, openSection }: EscapeFocusOptions): RegisterTrigger {
  const triggers = useRef(new Map<string, HTMLButtonElement>());
  const pending = useRef<string | null>(null);

  const registerTrigger = useCallback<RegisterTrigger>((id, element) => {
    if (element === null) triggers.current.delete(id);
    else triggers.current.set(id, element);
  }, []);

  useEffect(() => {
    if (openSection === null) return undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      const inside = containerRef.current?.contains(document.activeElement) ?? false;
      if (event.key !== ESCAPE_KEY || !inside) return;
      // `useMenuDismiss` does the closing; this only records where focus has to land afterwards.
      pending.current = openSection;
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [containerRef, openSection]);

  useEffect(() => {
    if (openSection !== null || pending.current === null) return;
    const target = triggers.current.get(pending.current);
    pending.current = null;
    target?.focus();
  }, [openSection]);

  return registerTrigger;
}

/** The wordmark, which is also the route home. */
function HomeLink() {
  return (
    <Link
      href="/"
      aria-label="Reliance Bank home"
      className={cn('text-fg shrink-0 rounded-sm', FOCUS_RING)}
    >
      <Logo height={LOGO_HEIGHT} decorative />
    </Link>
  );
}

/**
 * The interactive half of the header.
 *
 * Separated from `SiteHeader` so it can be keyed on the current path: a route change
 * remounts it, which resets every open menu at once. That is React's own answer to
 * "reset all state when something changes", and it avoids an effect that writes state
 * during a render pass the router has already started.
 */
export function HeaderNav() {
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpenSection(null), []);
  const toggle = useCallback(
    (id: string) => setOpenSection((current) => (current === id ? null : id)),
    [],
  );
  useMenuDismiss({ containerRef, open: openSection !== null, onDismiss: close });
  const registerTrigger = useEscapeFocus({ containerRef, openSection });

  const expanded = NAV_SECTIONS.find((section) => section.id === openSection);

  return (
    <>
      <div ref={containerRef}>
        <div className="rb-shell flex h-16 items-center gap-4">
          <HomeLink />
          <PrimaryNav
            openSection={openSection}
            onToggle={toggle}
            registerTrigger={registerTrigger}
          />
          <HeaderActions
            mobileOpen={mobileOpen}
            onToggleMobile={() => setMobileOpen((open) => !open)}
          />
        </div>

        {expanded ? <MegaMenuPanel section={expanded} onNavigate={close} /> : null}
      </div>

      <MobileNav open={mobileOpen} onNavigate={() => setMobileOpen(false)} />
    </>
  );
}
