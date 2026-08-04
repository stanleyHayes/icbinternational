'use client';

import Link from 'next/link';
import { useState, useSyncExternalStore } from 'react';

import { Button, cn, FOCUS_RING } from '@reliance/ui';

/** Where the choice is kept. Read on the client only — nothing is sent to a server. */
const STORAGE_KEY = 'rb-cookie-choice';

const CHOICES = { accepted: 'accepted', essential: 'essential' } as const;

type Choice = (typeof CHOICES)[keyof typeof CHOICES];

function readChoice(): Choice | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === CHOICES.accepted || stored === CHOICES.essential ? stored : null;
  } catch {
    return null;
  }
}

function writeChoice(choice: Choice): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // A browser that refuses storage simply gets asked again next visit.
  }
}

/** A choice made in another tab should take this banner down here too. */
function subscribe(onChange: () => void): () => void {
  window.addEventListener('storage', onChange);
  return () => window.removeEventListener('storage', onChange);
}

/**
 * The stored choice, read through `useSyncExternalStore`.
 *
 * localStorage is exactly what that hook is for: state React does not own. The server
 * snapshot reports a decision already made, so the banner is absent from the prerendered
 * HTML and never flashes in and out for a returning visitor.
 */
function useCookieChoice(): Choice | null {
  return useSyncExternalStore(subscribe, readChoice, () => CHOICES.accepted);
}

function NoticeCopy() {
  return (
    <div className="flex-1">
      <p id="cookie-notice-title" className="text-fg font-medium">
        Cookies on reliancebank.example
      </p>
      <p className="text-fg-muted mt-1 text-sm leading-relaxed">
        We use essential cookies to keep the site secure and working. With your agreement we also
        use analytics cookies to understand which pages help people and which do not. You can change
        your mind at any time in our{' '}
        <Link href="/legal/cookies" className={cn('text-accent font-medium underline', FOCUS_RING)}>
          cookie policy
        </Link>
        .
      </p>
    </div>
  );
}

/**
 * The cookie notice.
 *
 * Two buttons of equal visual weight. Making "accept" the loud one and "essential only" a
 * grey link is a dark pattern, and a bank of all things should not be running one.
 */
export function CookieBanner() {
  const stored = useCookieChoice();
  const [dismissed, setDismissed] = useState(false);

  if (stored !== null || dismissed) return null;

  const decide = (choice: Choice) => {
    writeChoice(choice);
    setDismissed(true);
  };

  return (
    <section
      aria-labelledby="cookie-notice-title"
      className={cn(
        'border-border bg-surface-raised fixed inset-x-0 bottom-0 z-40 border-t shadow-lg',
        'motion-safe:animate-slide-up',
      )}
    >
      <div className="rb-shell flex flex-col gap-4 py-5 md:flex-row md:items-center md:gap-8">
        <NoticeCopy />

        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          <Button variant="secondary" onClick={() => decide(CHOICES.essential)}>
            Essential cookies only
          </Button>
          <Button variant="primary" onClick={() => decide(CHOICES.accepted)}>
            Accept all cookies
          </Button>
        </div>
      </div>
    </section>
  );
}
