/**
 * The site's information architecture, in one place.
 *
 * Declared `as const` so every `href` keeps its literal type: with Next's typed routes on,
 * a link to a page that does not exist is a compile error rather than a 404 a customer
 * finds first.
 */

import type { SiteHref } from '@/lib/routes';

/** One link inside a mega-menu column. */
export interface NavLink {
  readonly href: SiteHref;
  readonly label: string;
  readonly description: string;
}

/** A top-level menu and the links it reveals. */
export interface NavSection {
  readonly id: string;
  readonly label: string;
  readonly href: SiteHref;
  readonly summary: string;
  readonly links: readonly NavLink[];
}

/** A plain link, as the footer lists them. */
export interface FooterLink {
  readonly href: SiteHref;
  readonly label: string;
}

export const NAV_SECTIONS = [
  {
    id: 'personal',
    label: 'Personal',
    href: '/personal',
    summary: 'Everyday accounts, cards and a mobile app that keeps up with you.',
    links: [
      {
        href: '/personal',
        label: 'Personal banking',
        description: 'Everything a current account should do, and nothing it should not.',
      },
      {
        href: '/personal/current-accounts',
        label: 'Current accounts',
        description: 'No monthly fee, instant notifications, salary in a day early.',
      },
      {
        href: '/personal/cards',
        label: 'Debit and credit cards',
        description: 'Freeze, unfreeze and set your own limits from the app.',
      },
      {
        href: '/rates-and-fees',
        label: 'Rates and fees',
        description: 'The whole price list on one page, published in full.',
      },
    ],
  },
  {
    id: 'business',
    label: 'Business',
    href: '/business',
    summary: 'Accounts, approvals, payroll and invoicing for teams of two to two hundred.',
    links: [
      {
        href: '/business',
        label: 'Business banking',
        description: 'Open in a day, with multi-user access from the start.',
      },
      {
        href: '/business#approvals',
        label: 'Payments and approvals',
        description: 'Two-signature rules, spend limits and a full audit trail.',
      },
      {
        href: '/business#payroll',
        label: 'Payroll',
        description: 'Pay a whole team in one batch, with per-employee status.',
      },
      {
        href: '/business#invoicing',
        label: 'Invoicing',
        description: 'Send an invoice, get paid into the account it belongs to.',
      },
    ],
  },
  {
    id: 'borrow',
    label: 'Borrow',
    href: '/borrow/loans',
    summary: 'Fixed-rate lending with the total cost shown before you apply.',
    links: [
      {
        href: '/borrow/loans',
        label: 'Personal loans',
        description: '£1,000 to £25,000 at a rate fixed for the whole term.',
      },
      {
        href: '/borrow/mortgages',
        label: 'Mortgages',
        description: 'Residential and buy-to-let, with a decision in principle in minutes.',
      },
      {
        href: '/borrow/overdrafts',
        label: 'Overdrafts',
        description: 'An arranged buffer, priced by the day and capped monthly.',
      },
      {
        href: '/borrow/loans#calculator',
        label: 'Repayment calculator',
        description: 'See the monthly payment and the total cost before applying.',
      },
    ],
  },
  {
    id: 'save',
    label: 'Save',
    href: '/savings',
    summary: 'Interest paid monthly, withdrawals whenever you need them.',
    links: [
      {
        href: '/savings',
        label: 'Savings accounts',
        description: 'Easy access and fixed-term, with rates published live.',
      },
      {
        href: '/savings#calculator',
        label: 'Savings calculator',
        description: 'Project a balance month by month at today’s rate.',
      },
      {
        href: '/savings#protection',
        label: 'How your money is protected',
        description: 'What deposit protection covers, and what it does not.',
      },
      {
        href: '/insights',
        label: 'Money insights',
        description: 'Practical guides from the people who build the product.',
      },
    ],
  },
  {
    id: 'help',
    label: 'Help',
    href: '/help',
    summary: 'Answers, branch opening times and a person to talk to.',
    links: [
      {
        href: '/help',
        label: 'Help centre',
        description: 'Search the answers to the questions we are asked most.',
      },
      {
        href: '/branches',
        label: 'Branch and ATM finder',
        description: 'Opening hours, services and step-free access.',
      },
      {
        href: '/security',
        label: 'Security centre',
        description: 'How we protect your account, and how you can help.',
      },
      {
        href: '/security/fraud',
        label: 'Fraud awareness',
        description: 'The scams we see most, and how to shut them down.',
      },
      {
        href: '/contact',
        label: 'Contact us',
        description: 'Phone, message or ask us to call you back.',
      },
    ],
  },
] as const satisfies readonly NavSection[];

/** Footer link groups. Legal sits in its own row beneath these. */
export const FOOTER_GROUPS = [
  {
    title: 'Personal',
    links: [
      { href: '/personal', label: 'Personal banking' },
      { href: '/personal/current-accounts', label: 'Current accounts' },
      { href: '/savings', label: 'Savings' },
      { href: '/personal/cards', label: 'Cards' },
      { href: '/rates-and-fees', label: 'Rates and fees' },
    ],
  },
  {
    title: 'Borrow',
    links: [
      { href: '/borrow/loans', label: 'Personal loans' },
      { href: '/borrow/mortgages', label: 'Mortgages' },
      { href: '/borrow/overdrafts', label: 'Overdrafts' },
    ],
  },
  {
    title: 'Business',
    links: [
      { href: '/business', label: 'Business banking' },
      { href: '/business#payroll', label: 'Payroll' },
      { href: '/business#invoicing', label: 'Invoicing' },
    ],
  },
  {
    title: 'Support',
    links: [
      { href: '/help', label: 'Help centre' },
      { href: '/branches', label: 'Branches and ATMs' },
      { href: '/contact', label: 'Contact us' },
      { href: '/security', label: 'Security centre' },
      { href: '/security/fraud', label: 'Fraud awareness' },
    ],
  },
  {
    title: 'Company',
    links: [
      { href: '/about', label: 'About us' },
      { href: '/careers', label: 'Careers' },
      { href: '/insights', label: 'Insights' },
      { href: '/accessibility', label: 'Accessibility' },
    ],
  },
] as const satisfies readonly { title: string; links: readonly FooterLink[] }[];

/** The legal row. Short, and always reachable. */
export const LEGAL_LINKS = [
  { href: '/legal/terms', label: 'Terms and conditions' },
  { href: '/legal/privacy', label: 'Privacy notice' },
  { href: '/legal/cookies', label: 'Cookie policy' },
  { href: '/accessibility', label: 'Accessibility statement' },
] as const satisfies readonly FooterLink[];
