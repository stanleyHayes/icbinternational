/**
 * Borrowing: application, decision, repayment and arrears.
 *
 * A declined application is the hardest email a bank sends. The rule here is that it says
 * what happened, does not imply a credit-file consequence that has not occurred, and
 * points at the one thing the customer can actually act on — the credit reference agency's
 * copy of their file.
 *
 * An arrears message never threatens. It states the position, the cost, and the fact that
 * talking to us early is what changes the outcome.
 */

import { NotificationCategory, NotificationSeverity } from '@reliance/contracts';

import { defineTemplate } from '../define-template.js';
import {
  AmountDirection,
  amount,
  bullets,
  button,
  details,
  paragraph,
} from '../render/email-node.js';

const LOANS_PATH = '/loans';

/** The application tracker, linked from every stage of the decision. */
const APPLICATIONS_PATH = '/loans/applications';

export const LENDING_TEMPLATES = {
  LOAN_APPLICATION_RECEIVED: defineTemplate({
    key: 'LOAN_APPLICATION_RECEIVED',
    category: NotificationCategory.LENDING,
    fixture: { reference: 'RL-2026-04812', amountFormatted: '£8,000.00', termLabel: '36 months' },
    compose: (props: { reference: string; amountFormatted: string; termLabel: string }, links) => ({
      subject: 'We have your loan application',
      preheader: `${props.amountFormatted} over ${props.termLabel}. Reference ${props.reference}.`,
      heading: 'We have your application',
      summary: `Your loan application for ${props.amountFormatted} is with us.`,
      nodes: [
        details([
          { label: 'Amount requested', value: props.amountFormatted },
          { label: 'Term', value: props.termLabel },
          { label: 'Reference', value: props.reference },
        ]),
        paragraph(
          'We are checking affordability and your credit file. Most decisions come back within two hours during the working day.',
        ),
        button('Track your application', links.app(APPLICATIONS_PATH)),
      ],
      action: { label: 'Track your application', url: links.app(APPLICATIONS_PATH) },
    }),
  }),

  LOAN_APPROVED: defineTemplate({
    key: 'LOAN_APPROVED',
    category: NotificationCategory.LENDING,
    severity: NotificationSeverity.SUCCESS,
    urgent: true,
    fixture: {
      amountFormatted: '£8,000.00',
      monthlyFormatted: '£243.11',
      termLabel: '36 months',
      aprLabel: '9.9% APR representative',
      totalRepayableFormatted: '£8,751.96',
      offerExpires: '29 March 2026',
    },
    compose: (
      props: {
        amountFormatted: string;
        monthlyFormatted: string;
        termLabel: string;
        aprLabel: string;
        totalRepayableFormatted: string;
        offerExpires: string;
      },
      links,
    ) => ({
      subject: `Your loan is approved — ${props.amountFormatted}`,
      preheader: `${props.monthlyFormatted} a month over ${props.termLabel}.`,
      heading: 'Your loan is approved',
      summary: `Your loan of ${props.amountFormatted} is approved at ${props.monthlyFormatted} a month.`,
      nodes: [
        amount('Approved', props.amountFormatted, AmountDirection.NEUTRAL),
        details([
          { label: 'Monthly repayment', value: props.monthlyFormatted },
          { label: 'Term', value: props.termLabel },
          { label: 'Rate', value: props.aprLabel },
          { label: 'Total repayable', value: props.totalRepayableFormatted },
          { label: 'Offer valid until', value: props.offerExpires },
        ]),
        paragraph(
          'Nothing is agreed until you accept. Read the agreement in the app, and take as long as you need — the offer holds until the date above.',
        ),
        paragraph(
          'You have 14 days from signing to withdraw. If you do, you repay what you borrowed plus interest for the days you had it, and nothing else.',
        ),
        button('Read the agreement', links.app(APPLICATIONS_PATH)),
      ],
      action: { label: 'Read the agreement', url: links.app(APPLICATIONS_PATH) },
    }),
  }),

  LOAN_DECLINED: defineTemplate({
    key: 'LOAN_DECLINED',
    category: NotificationCategory.LENDING,
    severity: NotificationSeverity.WARNING,
    fixture: {
      reference: 'RL-2026-04812',
      mainReason: 'the repayments would be high relative to your regular income',
    },
    compose: (props: { reference: string; mainReason: string }, links) => ({
      subject: 'About your loan application',
      preheader: 'We are not able to lend on this occasion.',
      heading: 'We cannot offer you this loan',
      summary: 'We are not able to offer you a loan on this occasion.',
      nodes: [
        paragraph(
          `We are sorry — we are not able to offer you this loan. The main factor was that ${props.mainReason}.`,
        ),
        paragraph(
          'This is a decision about this application, not a judgement about you, and you are welcome to apply again in future.',
        ),
        bullets([
          'The application itself leaves a record on your credit file that other lenders can see.',
          'You can ask the credit reference agency for a copy of your file and correct anything wrong on it.',
          'If you want us to look at the decision again, reply to this email or call us.',
        ]),
        details([{ label: 'Reference', value: props.reference }]),
        button('Talk to us', links.help),
      ],
    }),
  }),

  LOAN_FUNDED: defineTemplate({
    key: 'LOAN_FUNDED',
    category: NotificationCategory.LENDING,
    severity: NotificationSeverity.SUCCESS,
    fixture: {
      amountFormatted: '£8,000.00',
      accountLabel: 'Everyday Current Account ending 4471',
      firstPaymentDate: '1 May 2026',
      monthlyFormatted: '£243.11',
    },
    compose: (
      props: {
        amountFormatted: string;
        accountLabel: string;
        firstPaymentDate: string;
        monthlyFormatted: string;
      },
      links,
    ) => ({
      subject: `${props.amountFormatted} is in your account`,
      preheader: `First repayment ${props.firstPaymentDate}.`,
      heading: 'Your loan has been paid out',
      summary: `${props.amountFormatted} has been paid into your ${props.accountLabel}.`,
      nodes: [
        amount('Paid in', props.amountFormatted, AmountDirection.CREDIT),
        details([
          { label: 'Paid into', value: props.accountLabel },
          { label: 'First repayment', value: props.firstPaymentDate },
          { label: 'Monthly repayment', value: props.monthlyFormatted },
        ]),
        paragraph(
          'Repayments are collected by Direct Debit on the same date each month. You can overpay at any time without a charge, and overpaying reduces the interest you pay overall.',
        ),
        button('View your loan', links.app(LOANS_PATH)),
      ],
      action: { label: 'View your loan', url: links.app(LOANS_PATH) },
    }),
  }),
} as const;
