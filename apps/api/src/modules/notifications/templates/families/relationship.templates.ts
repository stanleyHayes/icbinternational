/**
 * Digests, insights and the small number of messages a customer can switch off entirely.
 *
 * `MARKETING` is the one category where "we thought you might like to know" is an
 * acceptable reason to send an email, and it is the category most likely to be muted. The
 * digest is deliberately not marketing: it is the batched form of notifications the
 * customer already asked for, so it keeps the category of whatever it is summarising.
 */

import {
  NotificationCategory,
  NotificationChannel,
  NotificationSeverity,
} from '@reliance/contracts';

import { defineTemplate } from '../define-template.js';
import {
  AmountDirection,
  amount,
  bullets,
  button,
  details,
  paragraph,
  subheading,
} from '../render/email-node.js';

export const RELATIONSHIP_TEMPLATES = {
  NOTIFICATION_DIGEST: defineTemplate({
    key: 'NOTIFICATION_DIGEST',
    category: NotificationCategory.SYSTEM,
    fixture: {
      periodLabel: 'the last few hours',
      itemCount: '6',
      lines: [
        '£23.85 at Corner Larder',
        '£94.20 collected by Northgate Energy',
        '£2,400.00 received from Ashcombe Design Ltd',
      ],
    },
    compose: (
      props: { periodLabel: string; itemCount: string; lines: readonly string[] },
      links,
    ) => ({
      subject: `${props.itemCount} updates on your account`,
      preheader: `Everything from ${props.periodLabel}, in one email.`,
      heading: 'Your account update',
      summary: `${props.itemCount} updates from ${props.periodLabel}.`,
      nodes: [
        paragraph(
          `Here is everything that happened on your account in ${props.periodLabel}, grouped so we are not filling your inbox one message at a time.`,
        ),
        bullets(props.lines),
        paragraph(
          'Anything urgent — a sign-in from a new device, a payment we have held — is always sent to you immediately and never grouped.',
        ),
        button('Open your account', links.app('/dashboard')),
      ],
      action: { label: 'Open your account', url: links.app('/dashboard') },
    }),
  }),

  MONTHLY_INSIGHTS: defineTemplate({
    key: 'MONTHLY_INSIGHTS',
    category: NotificationCategory.MARKETING,
    // Opt-in through the preference matrix: capable of in-app and email, both off by default.
    channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
    fixture: {
      monthLabel: 'March',
      spentFormatted: '£2,988.51',
      topCategory: 'Groceries',
      topCategoryFormatted: '£486.20',
      versusLastMonth: '£142 less than February',
    },
    compose: (
      props: {
        monthLabel: string;
        spentFormatted: string;
        topCategory: string;
        topCategoryFormatted: string;
        versusLastMonth: string;
      },
      links,
    ) => ({
      subject: `Your ${props.monthLabel} in numbers`,
      preheader: `You spent ${props.spentFormatted} — ${props.versusLastMonth}.`,
      heading: `Your ${props.monthLabel}`,
      summary: `You spent ${props.spentFormatted} in ${props.monthLabel}.`,
      nodes: [
        amount('Spent', props.spentFormatted, AmountDirection.NEUTRAL),
        subheading('Where it went'),
        details([
          { label: 'Biggest category', value: props.topCategory },
          { label: 'Spent there', value: props.topCategoryFormatted },
          { label: 'Against last month', value: props.versusLastMonth },
        ]),
        paragraph(
          'Set a budget for a category and we will tell you when you are three quarters of the way through it, rather than after you have passed it.',
        ),
        button('See the full breakdown', links.app('/insights')),
      ],
      action: { label: 'See the full breakdown', url: links.app('/insights') },
    }),
  }),

  BUDGET_THRESHOLD: defineTemplate({
    key: 'BUDGET_THRESHOLD',
    category: NotificationCategory.ACCOUNT,
    fixture: {
      categoryName: 'Eating out',
      spentFormatted: '£152.00',
      budgetFormatted: '£200.00',
      daysLeft: '11',
    },
    compose: (
      props: {
        categoryName: string;
        spentFormatted: string;
        budgetFormatted: string;
        daysLeft: string;
      },
      links,
    ) => ({
      subject: `${props.spentFormatted} of your ${props.categoryName} budget used`,
      preheader: `${props.daysLeft} days left in the month.`,
      heading: 'You are close to a budget',
      summary: `You have used ${props.spentFormatted} of your ${props.budgetFormatted} ${props.categoryName} budget.`,
      nodes: [
        details([
          { label: 'Category', value: props.categoryName },
          { label: 'Spent', value: props.spentFormatted },
          { label: 'Budget', value: props.budgetFormatted },
          { label: 'Days left', value: props.daysLeft },
        ]),
        paragraph(
          'We tell you before you pass a budget, not after. Adjust it any time if it is set too tight.',
        ),
        button('Review your budgets', links.app('/insights/budgets')),
      ],
      action: { label: 'Review your budgets', url: links.app('/insights/budgets') },
    }),
  }),

  PRODUCT_ANNOUNCEMENT: defineTemplate({
    key: 'PRODUCT_ANNOUNCEMENT',
    category: NotificationCategory.MARKETING,
    // Opt-in through the preference matrix: capable of in-app and email, both off by default.
    channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
    fixture: {
      headline: 'Joint accounts are here',
      body: 'You can now open a current account with someone else, with separate sign-ins and a shared balance.',
      readMorePath: '/personal/joint-accounts',
    },
    compose: (props: { headline: string; body: string; readMorePath: string }, links) => ({
      subject: props.headline,
      preheader: props.body,
      heading: props.headline,
      summary: props.headline,
      nodes: [
        paragraph(props.body),
        button('Read more', links.site(props.readMorePath)),
        paragraph(
          'You are getting this because you have not switched off product news. You can at any time.',
        ),
      ],
    }),
  }),

  TERMS_CHANGE: defineTemplate({
    key: 'TERMS_CHANGE',
    category: NotificationCategory.SYSTEM,
    severity: NotificationSeverity.WARNING,
    fixture: {
      whatChanges: 'the fees we charge for payments outside the UK',
      effectiveDate: '1 July 2026',
      summaryPath: '/legal/terms-changes',
    },
    compose: (
      props: { whatChanges: string; effectiveDate: string; summaryPath: string },
      links,
    ) => ({
      subject: `Changes to your terms from ${props.effectiveDate}`,
      preheader: `We are changing ${props.whatChanges}.`,
      heading: 'We are changing your terms',
      summary: `We are changing ${props.whatChanges} from ${props.effectiveDate}.`,
      nodes: [
        paragraph(
          `From ${props.effectiveDate} we are changing ${props.whatChanges}. We are telling you two months ahead, as we are required to.`,
        ),
        paragraph(
          'If you are happy with the change you do not need to do anything. If you are not, you can close your account before that date without any charge.',
        ),
        button('Read exactly what is changing', links.site(props.summaryPath)),
      ],
    }),
  }),
} as const;
