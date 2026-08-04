/**
 * Servicing notices: changes to a customer's details, planned maintenance and closure.
 *
 * Every change to a customer's details is announced, whichever channel it came from. A
 * change made without the customer's knowledge is the first step in an account takeover,
 * and it only stays invisible if we decide not to mention it.
 */

import { NotificationCategory, NotificationSeverity } from '@reliance/contracts';

import { defineTemplate } from '../define-template.js';
import { bullets, button, callout, details, paragraph, Tone } from '../render/email-node.js';

export const SERVICING_TEMPLATES = {
  ACCOUNT_DETAILS_CHANGED: defineTemplate({
    key: 'ACCOUNT_DETAILS_CHANGED',
    category: NotificationCategory.SECURITY,
    severity: NotificationSeverity.WARNING,
    urgent: true,
    fixture: {
      changeDescription: 'the postal address on your account',
      changedAt: '15 March 2026 at 09:12',
    },
    compose: (props: { changeDescription: string; changedAt: string }, links) => ({
      subject: 'We have updated your details',
      preheader: `${props.changeDescription} changed on ${props.changedAt}.`,
      heading: 'Your details were changed',
      summary: `We changed ${props.changeDescription}.`,
      nodes: [
        paragraph(`We changed ${props.changeDescription} on ${props.changedAt}.`),
        paragraph(
          'We tell you about every change to your details, from whichever channel it came, so a change made without your knowledge cannot go unnoticed.',
        ),
        callout(
          Tone.CRITICAL,
          'If you did not make this change, call us on 0800 019 4400 immediately.',
        ),
        button('Review your details', links.app('/settings/profile')),
      ],
    }),
  }),

  SERVICE_NOTICE: defineTemplate({
    key: 'SERVICE_NOTICE',
    category: NotificationCategory.SYSTEM,
    fixture: {
      windowLabel: 'Sunday 22 March, 02:00 to 04:00',
      affectedServices: 'Card payments and transfers',
      whatStillWorks: 'Cash machines, Direct Debits and standing orders',
    },
    compose: (props: {
      windowLabel: string;
      affectedServices: string;
      whatStillWorks: string;
    }) => ({
      subject: `Planned maintenance: ${props.windowLabel}`,
      preheader: `${props.affectedServices} may be briefly unavailable.`,
      heading: 'Planned maintenance',
      summary: `${props.affectedServices} may be unavailable on ${props.windowLabel}.`,
      nodes: [
        paragraph(
          `We are carrying out planned maintenance on ${props.windowLabel}. We have chosen the quietest window of the week to keep the disruption small.`,
        ),
        bullets([
          `May be unavailable: ${props.affectedServices}`,
          `Unaffected: ${props.whatStillWorks}`,
        ]),
        paragraph(
          'Payments you schedule for that window will be sent as soon as the work finishes, with their original dates preserved.',
        ),
      ],
    }),
  }),

  ACCOUNT_CLOSED: defineTemplate({
    key: 'ACCOUNT_CLOSED',
    category: NotificationCategory.ACCOUNT,
    fixture: {
      accountName: 'Everyday Current Account',
      closedOn: '31 March 2026',
      finalBalanceFormatted: '£0.00',
      destinationSummary: 'your nominated account ending 8820',
    },
    compose: (
      props: {
        accountName: string;
        closedOn: string;
        finalBalanceFormatted: string;
        destinationSummary: string;
      },
      links,
    ) => ({
      subject: `Your ${props.accountName} is closed`,
      preheader: `Closed on ${props.closedOn}.`,
      heading: 'Your account is closed',
      summary: `Your ${props.accountName} was closed on ${props.closedOn}.`,
      nodes: [
        details([
          { label: 'Account', value: props.accountName },
          { label: 'Closed', value: props.closedOn },
          { label: 'Final balance', value: props.finalBalanceFormatted },
          { label: 'Sent to', value: props.destinationSummary },
        ]),
        paragraph(
          'We are required to keep a record of the account and its transactions for six years. You can download your statements from the app for another 30 days, and after that by asking us.',
        ),
        paragraph('If you would like to bank with us again, you are welcome at any time.'),
        button('Download your statements', links.app('/statements')),
      ],
    }),
  }),
} as const;
