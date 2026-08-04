/**
 * The queues an operator lives in.
 *
 * Ordered the way a working day is: the things that arrive and must be cleared come
 * first, and the customer record everything else hangs off sits with them. Each entry
 * names the permissions that make it worth offering.
 */

import {
  BookOpenCheck,
  ClipboardCheck,
  CreditCard,
  FileText,
  Gauge,
  Landmark,
  ListChecks,
  Radar,
  Receipt,
  ShieldAlert,
  Snowflake,
  Split,
  TrendingDown,
  Users,
} from 'lucide-react';

import { Permission } from '@reliance/contracts';

import type { NavSection } from './nav-model';

/** Day-to-day operations, customer records and the compliance queues. */
export const FRONTLINE_SECTIONS: readonly NavSection[] = [
  {
    id: 'operations',
    label: 'Operations',
    items: [
      {
        id: 'overview',
        label: 'Overview',
        description: 'Balances, volumes, queue depths and counterparty health at a glance',
        path: '/overview',
        icon: Gauge,
        keywords: ['dashboard', 'kpi', 'home'],
      },
      {
        id: 'transactions',
        label: 'Transactions',
        description: 'Search every posting in the bank and inspect both sides of an entry',
        path: '/transactions',
        icon: Receipt,
        requires: [Permission.TRANSACTION_READ],
        keywords: ['postings', 'journal', 'search'],
      },
      {
        id: 'approvals',
        label: 'Approvals',
        description: 'Manual postings, reversals and overrides waiting on a second approver',
        path: '/approvals',
        icon: ClipboardCheck,
        requires: [Permission.POSTING_APPROVE, Permission.POSTING_INITIATE],
        keywords: ['dual control', 'four eyes', 'maker checker'],
      },
      {
        id: 'holds',
        label: 'Holds',
        description: 'Liens, court orders and compliance freezes across the book',
        path: '/holds',
        icon: Snowflake,
        requires: [Permission.HOLD_MANAGE],
        keywords: ['lien', 'freeze', 'blocked funds'],
      },
      {
        id: 'disputes',
        label: 'Disputes',
        description: 'Chargebacks, evidence and provisional credit decisions',
        path: '/disputes',
        icon: Split,
        requires: [Permission.DISPUTE_MANAGE],
        keywords: ['chargeback', 'representment'],
      },
      {
        id: 'cards',
        label: 'Cards',
        description: 'Issue, block and reissue cards, and read the authorisation log',
        path: '/cards',
        icon: CreditCard,
        requires: [Permission.CARD_MANAGE],
        keywords: ['bin', 'authorisation', 'decline'],
      },
    ],
  },
  {
    id: 'customers',
    label: 'Customers',
    items: [
      {
        id: 'customer-search',
        label: 'Customers',
        description: 'One customer, everything about them: accounts, cards, cases, devices',
        path: '/customers',
        icon: Users,
        requires: [Permission.CUSTOMER_READ],
        keywords: ['360', 'profile', 'account holder'],
      },
    ],
  },
  {
    id: 'compliance',
    label: 'Compliance',
    items: [
      {
        id: 'kyc',
        label: 'Identity review',
        description: 'The verification queue, document review and tier decisions',
        path: '/kyc',
        icon: BookOpenCheck,
        requires: [Permission.KYC_READ],
        keywords: ['kyc', 'onboarding', 'documents', 'tier'],
      },
      {
        id: 'screening',
        label: 'Screening',
        description: 'Sanctions, PEP and adverse-media hits awaiting adjudication',
        path: '/screening',
        icon: Radar,
        requires: [Permission.KYC_READ],
        keywords: ['sanctions', 'pep', 'watchlist'],
      },
      {
        id: 'aml-alerts',
        label: 'Monitoring alerts',
        description: 'Transaction-monitoring alerts, triage and escalation to a case',
        path: '/aml/alerts',
        icon: ShieldAlert,
        requires: [Permission.AML_READ],
        keywords: ['aml', 'suspicious', 'triage'],
      },
      {
        id: 'aml-cases',
        label: 'Investigations',
        description: 'Case workspace, evidence and disposition',
        path: '/aml/cases',
        icon: FileText,
        requires: [Permission.AML_READ],
        keywords: ['aml', 'case', 'sar', 'report'],
      },
      {
        id: 'aml-rules',
        label: 'Rule tuning',
        description: 'Monitoring and fraud rules, thresholds, and backtests over history',
        path: '/aml/rules',
        icon: ListChecks,
        requires: [Permission.AML_RULE_WRITE, Permission.FRAUD_MANAGE],
        keywords: ['threshold', 'backtest', 'false positive'],
      },
    ],
  },
  {
    id: 'lending',
    label: 'Lending',
    items: [
      {
        id: 'applications',
        label: 'Applications',
        description: 'Underwriting queue, affordability assessment and offer decisions',
        path: '/lending/applications',
        icon: Landmark,
        requires: [Permission.LOAN_DECIDE],
        keywords: ['underwriting', 'loan', 'credit'],
      },
      {
        id: 'arrears',
        label: 'Arrears',
        description: 'Loans behind schedule, collections and payment plans',
        path: '/lending/arrears',
        icon: TrendingDown,
        requires: [Permission.LOAN_DECIDE],
        keywords: ['collections', 'delinquency', 'write-off'],
      },
    ],
  },
];
