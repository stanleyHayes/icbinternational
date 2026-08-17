/**
 * Finance, the catalogue, support and administration.
 *
 * These are the screens an operator visits deliberately rather than lives in, so they sit
 * below the queues. Operations control is last because it is the most consequential:
 * running end-of-day or funding the clearing account affects the whole book.
 */

import {
  Banknote,
  CalendarClock,
  Flag,
  LifeBuoy,
  Megaphone,
  MessageSquare,
  Scale,
  ScrollText,
  Tags,
  UserCog,
  Workflow,
} from 'lucide-react';

import { Permission } from '@reliance/contracts';

import type { NavSection } from './nav-model';

/** Reporting, the product and content catalogue, support, and platform administration. */
export const BACK_OFFICE_SECTIONS: readonly NavSection[] = [
  {
    id: 'finance',
    label: 'Finance',
    items: [
      {
        id: 'trial-balance',
        label: 'Trial balance',
        description: 'Every general-ledger account, proving the book sums to zero',
        path: '/finance/trial-balance',
        icon: Scale,
        requires: [Permission.REPORT_READ],
        keywords: ['gl', 'ledger', 'balance'],
      },
      {
        id: 'reports',
        label: 'Reports',
        description: 'Profit and loss, balance sheet, reconciliation and regulatory exports',
        path: '/finance/reports',
        icon: Banknote,
        requires: [Permission.REPORT_READ],
        keywords: ['profit and loss', 'balance sheet', 'reconciliation', 'export'],
      },
    ],
  },
  {
    id: 'catalogue',
    label: 'Products & content',
    items: [
      {
        id: 'products',
        label: 'Products',
        description: 'Rates, fees, limits and effective-dated product versions',
        path: '/products',
        icon: Tags,
        requires: [Permission.PRODUCT_WRITE],
        keywords: ['pricing', 'rates', 'fees', 'limits'],
      },
      {
        id: 'content',
        label: 'Content',
        description: 'Pages, articles, FAQs, branch details and legal documents',
        path: '/content',
        icon: ScrollText,
        requires: [Permission.CONTENT_WRITE, Permission.CONTENT_PUBLISH],
        keywords: ['pages', 'faq', 'publish', 'revision'],
      },
      {
        id: 'comms',
        label: 'Communications',
        description: 'Message templates, campaigns and delivery analytics',
        path: '/comms',
        icon: Megaphone,
        requires: [Permission.COMMS_SEND],
        keywords: ['email', 'sms', 'push', 'campaign'],
      },
    ],
  },
  {
    id: 'support',
    label: 'Support',
    items: [
      {
        id: 'tickets',
        label: 'Tickets',
        description: 'The support queue, SLA board and customer threads',
        path: '/support/tickets',
        icon: LifeBuoy,
        requires: [Permission.TICKET_MANAGE],
        keywords: ['helpdesk', 'sla', 'chat', 'escalation'],
      },
      {
        id: 'live-chat',
        label: 'Live chat',
        description: 'Real-time conversations from the app and the website',
        path: '/support/chat',
        icon: MessageSquare,
        requires: [Permission.TICKET_MANAGE],
        keywords: ['chat', 'support', 'realtime'],
      },
    ],
  },
  {
    id: 'platform',
    label: 'Administration',
    items: [
      {
        id: 'staff',
        label: 'Staff & roles',
        description: 'Staff accounts, role bundles and the permission matrix',
        path: '/platform/staff',
        icon: UserCog,
        requires: [Permission.ADMIN_MANAGE],
        keywords: ['users', 'roles', 'permissions', 'access'],
      },
      {
        id: 'audit',
        label: 'Audit trail',
        description: 'Every change the bank has recorded, with hash-chain verification',
        path: '/platform/audit',
        icon: ScrollText,
        requires: [Permission.AUDIT_READ],
        keywords: ['log', 'chain', 'history', 'who changed this'],
      },
      {
        id: 'flags',
        label: 'Feature flags',
        description: 'Rollout percentages and segment targeting',
        path: '/platform/flags',
        icon: Flag,
        requires: [Permission.FLAG_WRITE],
        keywords: ['rollout', 'toggle', 'release'],
      },
      {
        id: 'jobs',
        label: 'Job monitor',
        description: 'Background runs, failures and replay of the dead-letter queue',
        path: '/platform/jobs',
        icon: Workflow,
        requires: [Permission.JOB_MANAGE],
        keywords: ['queue', 'retry', 'dead letter', 'scheduler'],
      },
    ],
  },
  {
    id: 'operations-control',
    label: 'Operations control',
    items: [
      {
        id: 'business-date',
        label: 'Business date & batch',
        description: 'End-of-day processing, batch runs, rail health and treasury funding',
        path: '/operations-control',
        icon: CalendarClock,
        requires: [Permission.SIMULATION_RUN],
        keywords: ['end of day', 'batch', 'accrual', 'settlement', 'value date', 'cut-off'],
      },
    ],
  },
];
