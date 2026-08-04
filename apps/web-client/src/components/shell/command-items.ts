'use client';

/**
 * What the command palette can do.
 *
 * Two kinds of entry, and the distinction matters: a *destination* takes you somewhere and is
 * always safe, an *action* does something. Nothing that moves money is in here. A palette that can
 * send a payment on one keystroke and a stray Enter is a palette that will, and "I don't know, it
 * just went" is not an answer a bank can give.
 */

import { ArrowRightLeft, FileText, LogOut, Shield, UserRound, type LucideIcon } from 'lucide-react';
import type { Route } from 'next';

import { PRIMARY_NAV } from '@/lib/nav';
import { appRoutes } from '@/lib/routes';

/** One row in the palette. */
export interface CommandItem {
  readonly id: string;
  readonly label: string;
  /** One line of explanation, shown beside the label. */
  readonly hint: string;
  /** Heading the row is filed under. */
  readonly group: string;
  readonly icon: LucideIcon;
  readonly keywords: readonly string[];
  /** Where it goes. Mutually exclusive with `run`. */
  readonly href?: Route;
  /** What it does. Mutually exclusive with `href`. */
  readonly run?: () => void;
}

const GO_TO = 'Go to';
const SHORTCUTS = 'Shortcuts';

/** Destinations that are not in the sidebar but are worth reaching by name. */
const DEEP_LINKS: readonly CommandItem[] = [
  {
    id: 'send-money',
    label: 'Send money',
    hint: 'Start a transfer to your own account or someone else',
    group: SHORTCUTS,
    icon: ArrowRightLeft,
    keywords: ['transfer', 'pay', 'send', 'international'],
    href: appRoutes.transfers,
  },
  {
    id: 'payees',
    label: 'Payees',
    hint: 'People and businesses you have paid before',
    group: SHORTCUTS,
    icon: UserRound,
    keywords: ['beneficiary', 'recipient', 'contact'],
    href: appRoutes.payees,
  },
  {
    id: 'statements',
    label: 'Statements',
    hint: 'Download a statement or a proof-of-balance letter',
    group: SHORTCUTS,
    icon: FileText,
    keywords: ['pdf', 'download', 'proof', 'letter', 'export'],
    href: appRoutes.accounts,
  },
  {
    id: 'security',
    label: 'Security',
    hint: 'Passkeys, devices, sessions and your transaction PIN',
    group: SHORTCUTS,
    icon: Shield,
    keywords: ['password', 'passkey', '2fa', 'devices', 'sessions', 'pin'],
    href: appRoutes.settingsSecurity,
  },
];

/**
 * Every entry, in the order the palette shows them when nothing has been typed.
 *
 * @param onSignOut the sign-out action, supplied by the shell so the palette owns no session logic.
 */
export function commandItems(onSignOut: () => void): readonly CommandItem[] {
  const destinations = PRIMARY_NAV.map(
    (item): CommandItem => ({
      id: `nav-${item.key}`,
      label: item.label,
      hint: item.description,
      group: GO_TO,
      icon: item.icon,
      keywords: item.keywords,
      href: item.href,
    }),
  );

  return [
    ...destinations,
    ...DEEP_LINKS,
    {
      id: 'sign-out',
      label: 'Sign out',
      hint: 'End this session on this device',
      group: SHORTCUTS,
      icon: LogOut,
      keywords: ['log out', 'leave', 'exit'],
      run: onSignOut,
    },
  ];
}

/**
 * Filters and ranks against what has been typed.
 *
 * A label that starts with the query outranks one that merely contains it, which outranks a
 * keyword match. Anyone typing "ca" means Cards, not "Manage your **ca**rds" buried under three
 * other rows.
 */
export function rankItems(items: readonly CommandItem[], query: string): readonly CommandItem[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return items;

  const LABEL_PREFIX = 0;
  const LABEL_MATCH = 1;
  const KEYWORD_MATCH = 2;
  const NO_MATCH = 3;

  const score = (item: CommandItem): number => {
    const label = item.label.toLowerCase();
    if (label.startsWith(needle)) return LABEL_PREFIX;
    if (label.includes(needle)) return LABEL_MATCH;
    if (item.keywords.some((keyword) => keyword.includes(needle))) return KEYWORD_MATCH;
    if (item.hint.toLowerCase().includes(needle)) return KEYWORD_MATCH;
    return NO_MATCH;
  };

  return items
    .map((item) => ({ item, rank: score(item) }))
    .filter((entry) => entry.rank !== NO_MATCH)
    .sort((left, right) => left.rank - right.rank)
    .map((entry) => entry.item);
}
