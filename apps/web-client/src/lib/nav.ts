/**
 * The shape of the application's navigation.
 *
 * One list, consumed by the sidebar, the mobile bar and the command palette, so the three can
 * never disagree about what the bank offers or where it lives. Order is deliberate: it runs from
 * what a customer opens daily to what they open twice a year.
 */

import {
  ArrowRightLeft,
  Banknote,
  ChartPie,
  CreditCard,
  House,
  LifeBuoy,
  PiggyBank,
  Settings,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { Route } from 'next';

import { appRoutes } from './routes';

/** One destination in the primary navigation. */
export interface NavItem {
  /** Stable identifier, used as a React key and as the command-palette match target. */
  readonly key: string;
  readonly label: string;
  readonly href: Route;
  readonly icon: LucideIcon;
  /** One line explaining the destination. Shown in the command palette, not in the sidebar. */
  readonly description: string;
  /** Extra words the command palette should match on. */
  readonly keywords: readonly string[];
}

/** Every destination in the signed-in application. */
export const PRIMARY_NAV: readonly NavItem[] = [
  {
    key: 'home',
    label: 'Home',
    href: appRoutes.dashboard,
    icon: House,
    description: 'Balances, recent activity and what needs your attention',
    keywords: ['dashboard', 'overview', 'balance'],
  },
  {
    key: 'accounts',
    label: 'Accounts',
    href: appRoutes.accounts,
    icon: Wallet,
    description: 'Every account, its transactions and its statements',
    keywords: ['current', 'savings', 'iban', 'statement', 'transactions'],
  },
  {
    key: 'payments',
    label: 'Payments',
    href: appRoutes.payments,
    icon: ArrowRightLeft,
    description: 'Send money, pay a bill, top up and manage standing orders',
    keywords: ['transfer', 'send', 'bill', 'payee', 'standing order', 'direct debit'],
  },
  {
    key: 'cards',
    label: 'Cards',
    href: appRoutes.cards,
    icon: CreditCard,
    description: 'Freeze a card, set spending controls and order a replacement',
    keywords: ['debit', 'freeze', 'pin', 'contactless', 'lost'],
  },
  {
    key: 'save',
    label: 'Save',
    href: appRoutes.save,
    icon: PiggyBank,
    description: 'Savings goals, round-ups and fixed-rate deposits',
    keywords: ['goal', 'vault', 'interest', 'deposit', 'round up'],
  },
  {
    key: 'borrow',
    label: 'Borrow',
    href: appRoutes.borrow,
    icon: Banknote,
    description: 'Loans, overdrafts and your repayment schedule',
    keywords: ['loan', 'overdraft', 'credit', 'repayment', 'apply'],
  },
  {
    key: 'insights',
    label: 'Insights',
    href: appRoutes.insights,
    icon: ChartPie,
    description: 'Where your money goes, budgets and upcoming commitments',
    keywords: ['spending', 'budget', 'category', 'cashflow', 'subscriptions'],
  },
  {
    key: 'support',
    label: 'Support',
    href: appRoutes.support,
    icon: LifeBuoy,
    description: 'Message us, dispute a payment or report fraud',
    keywords: ['help', 'contact', 'dispute', 'fraud', 'complaint', 'ticket'],
  },
  {
    key: 'settings',
    label: 'Settings',
    href: appRoutes.settings,
    icon: Settings,
    description: 'Your details, security, limits and preferences',
    keywords: ['profile', 'password', 'security', 'passkey', 'limits', 'theme'],
  },
];

/** Keys shown in the mobile bar. Five is the most a thumb can reach without a menu. */
const MOBILE_KEYS: readonly string[] = ['home', 'accounts', 'payments', 'cards', 'insights'];

/** The mobile bottom bar, in the same order as the sidebar. */
export const MOBILE_NAV: readonly NavItem[] = PRIMARY_NAV.filter((item) =>
  MOBILE_KEYS.includes(item.key),
);

/**
 * Whether a destination is the one being viewed.
 *
 * Prefix matching, so `/accounts/acc_01J…/transactions` still highlights Accounts. Home is matched
 * exactly — as the shortest path it would otherwise claim every route in the app.
 */
export function isCurrent(pathname: string, href: string): boolean {
  if (href === appRoutes.dashboard) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
