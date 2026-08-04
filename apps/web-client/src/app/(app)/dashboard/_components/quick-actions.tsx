'use client';

/**
 * The four things a customer opens the app to do.
 *
 * Four, not nine. Every extra shortcut on a home screen makes the other eight harder to find, and
 * the long tail is one keystroke away in the command palette the shell already provides.
 *
 * Nothing here moves money on its own — each is a link to a screen where the customer confirms.
 * A home screen that can send a payment in one tap is a home screen that will.
 */

import { ArrowRightLeft, CreditCard, PiggyBank, Receipt } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';

import { cn, FOCUS_RING, TRANSITION_STATE } from '@reliance/ui';

import { transactionsRoute } from '@/components/transactions/routes';
import { appRoutes } from '@/lib/routes';

interface Action {
  readonly key: string;
  readonly label: string;
  readonly hint: string;
  readonly href: Route;
  readonly icon: LucideIcon;
}

const ACTIONS: readonly Action[] = [
  {
    key: 'send',
    label: 'Send money',
    hint: 'To a payee or between your accounts',
    href: appRoutes.transfers,
    icon: ArrowRightLeft,
  },
  {
    key: 'activity',
    label: 'Find a payment',
    hint: 'Search and filter everything that has moved',
    href: transactionsRoute(),
    icon: Receipt,
  },
  {
    key: 'cards',
    label: 'Your cards',
    hint: 'Freeze a card or change its limits',
    href: appRoutes.cards,
    icon: CreditCard,
  },
  {
    key: 'save',
    label: 'Put money aside',
    hint: 'Goals, round-ups and fixed rates',
    href: appRoutes.save,
    icon: PiggyBank,
  },
];

/** The home screen's shortcuts. */
export function QuickActions() {
  return (
    <nav aria-label="Things you do most">
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {ACTIONS.map((action) => (
          <li key={action.key}>
            <Link
              href={action.href}
              className={cn(
                'border-border bg-surface flex h-full flex-col gap-1 rounded-lg border p-4',
                'hover:border-border-strong hover:bg-surface-sunken',
                FOCUS_RING,
                TRANSITION_STATE,
              )}
            >
              <action.icon aria-hidden="true" className="text-accent size-5" />
              <span className="text-fg mt-1 font-medium">{action.label}</span>
              <span className="text-fg-muted text-sm">{action.hint}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
