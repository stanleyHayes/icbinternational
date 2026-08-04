/**
 * Living with a loan: repayments due, repayments missed, and the day it is settled.
 *
 * The arrears message never threatens. It states the position, the cost, and the fact that
 * talking to us early is what changes the outcome — plus the two free debt-advice services,
 * because a lender that only offers its own number is not actually offering help.
 */

import { NotificationCategory, NotificationSeverity } from '@reliance/contracts';

import { defineTemplate } from '../define-template.js';
import { bullets, button, callout, details, paragraph, Tone } from '../render/email-node.js';

const LOANS_PATH = '/loans';

export const LENDING_SERVICING_TEMPLATES = {
  LOAN_REPAYMENT_DUE: defineTemplate({
    key: 'LOAN_REPAYMENT_DUE',
    category: NotificationCategory.LENDING,
    fixture: {
      amountFormatted: '£243.11',
      dueDate: '1 May 2026',
      remainingFormatted: '£7,512.85',
      paymentsLeft: '35',
    },
    compose: (
      props: {
        amountFormatted: string;
        dueDate: string;
        remainingFormatted: string;
        paymentsLeft: string;
      },
      links,
    ) => ({
      subject: `${props.amountFormatted} loan repayment on ${props.dueDate}`,
      preheader: `${props.paymentsLeft} repayments left.`,
      heading: 'Your loan repayment is due',
      summary: `${props.amountFormatted} is due on ${props.dueDate}.`,
      nodes: [
        details([
          { label: 'Amount', value: props.amountFormatted },
          { label: 'Due', value: props.dueDate },
          { label: 'Balance outstanding', value: props.remainingFormatted },
          { label: 'Repayments remaining', value: props.paymentsLeft },
        ]),
        paragraph(
          'We collect this by Direct Debit. Please make sure the money is there the day before.',
        ),
        button('View your loan', links.app(LOANS_PATH)),
      ],
    }),
  }),

  LOAN_REPAYMENT_MISSED: defineTemplate({
    key: 'LOAN_REPAYMENT_MISSED',
    category: NotificationCategory.LENDING,
    severity: NotificationSeverity.CRITICAL,
    urgent: true,
    fixture: {
      amountFormatted: '£243.11',
      dueDate: '1 May 2026',
      arrearsFormatted: '£243.11',
    },
    compose: (
      props: { amountFormatted: string; dueDate: string; arrearsFormatted: string },
      links,
    ) => ({
      subject: 'We could not collect your loan repayment',
      preheader: `${props.amountFormatted} due on ${props.dueDate} was not collected.`,
      heading: 'We could not collect your repayment',
      summary: `Your ${props.amountFormatted} repayment due on ${props.dueDate} was not collected.`,
      nodes: [
        details([
          { label: 'Amount due', value: props.amountFormatted },
          { label: 'Due date', value: props.dueDate },
          { label: 'Now in arrears', value: props.arrearsFormatted },
        ]),
        paragraph(
          'Interest continues to accrue on the balance, and a missed repayment will be reported to credit reference agencies if it stays unpaid.',
        ),
        callout(
          Tone.CAUTION,
          'If money is tight, tell us now rather than later. We can change the payment date, reduce payments for a period, or pause them — and we can only do that if we know.',
        ),
        bullets([
          'Call us on 0800 019 4400, Monday to Saturday, 8am to 8pm.',
          'Free, independent debt advice is available from StepChange and National Debtline.',
        ]),
        button('Make a payment', links.app(LOANS_PATH)),
      ],
      action: { label: 'Make a payment', url: links.app(LOANS_PATH) },
    }),
  }),

  LOAN_SETTLED: defineTemplate({
    key: 'LOAN_SETTLED',
    category: NotificationCategory.LENDING,
    severity: NotificationSeverity.SUCCESS,
    fixture: {
      originalAmountFormatted: '£8,000.00',
      totalPaidFormatted: '£8,751.96',
      settledOn: '1 April 2029',
    },
    compose: (props: {
      originalAmountFormatted: string;
      totalPaidFormatted: string;
      settledOn: string;
    }) => ({
      subject: 'Your loan is fully repaid',
      preheader: `Settled on ${props.settledOn}.`,
      heading: 'Your loan is repaid',
      summary: `Your loan was fully repaid on ${props.settledOn}.`,
      nodes: [
        paragraph('That is the last payment. The loan is closed and nothing further is owed.'),
        details([
          { label: 'Originally borrowed', value: props.originalAmountFormatted },
          { label: 'Total repaid', value: props.totalPaidFormatted },
          { label: 'Settled', value: props.settledOn },
        ]),
        paragraph(
          'We have told the credit reference agencies the account is settled. It can take up to 30 days to appear on your file.',
        ),
        paragraph(
          'The Direct Debit will be cancelled automatically. There is nothing for you to do.',
        ),
      ],
    }),
  }),
} as const;
