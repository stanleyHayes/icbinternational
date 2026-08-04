/**
 * Money leaving and arriving.
 *
 * Amounts arrive pre-formatted from the caller — `Money.format()` does the work long
 * before a template sees a figure — and every one of them is rendered through an `amount`
 * node so the direction is carried by a sign and a word as well as by a colour.
 */

import { NotificationCategory, NotificationSeverity } from '@reliance/contracts';

import { defineTemplate } from '../define-template.js';
import {
  AmountDirection,
  amount,
  button,
  callout,
  details,
  paragraph,
  Tone,
} from '../render/email-node.js';

const VIEW_TRANSACTIONS = 'View your transactions';

/** The transaction feed, linked from every confirmation. */
const TRANSACTIONS_PATH = '/transactions';

export const PAYMENT_TEMPLATES = {
  TRANSFER_SENT: defineTemplate({
    key: 'TRANSFER_SENT',
    category: NotificationCategory.TRANSACTION,
    urgent: true,
    fixture: {
      payeeName: 'Rosewood Lettings',
      amountFormatted: '£1,150.00',
      reference: 'Flat 4B March',
      balanceFormatted: '£2,318.42',
      sentAt: '1 March 2026 at 08:31',
    },
    compose: (
      props: {
        payeeName: string;
        amountFormatted: string;
        reference: string;
        balanceFormatted: string;
        sentAt: string;
      },
      links,
    ) => ({
      subject: `You sent ${props.amountFormatted} to ${props.payeeName}`,
      preheader: `Reference ${props.reference}. Balance now ${props.balanceFormatted}.`,
      heading: 'Payment sent',
      summary: `You sent ${props.amountFormatted} to ${props.payeeName}.`,
      nodes: [
        amount('Sent', props.amountFormatted, AmountDirection.DEBIT),
        details([
          { label: 'Paid to', value: props.payeeName },
          { label: 'Reference', value: props.reference },
          { label: 'Sent', value: props.sentAt },
          { label: 'Balance after', value: props.balanceFormatted },
        ]),
        paragraph('Payments within the UK usually arrive within seconds and always the same day.'),
        button(VIEW_TRANSACTIONS, links.app(TRANSACTIONS_PATH)),
      ],
      action: { label: VIEW_TRANSACTIONS, url: links.app(TRANSACTIONS_PATH) },
    }),
  }),

  TRANSFER_RECEIVED: defineTemplate({
    key: 'TRANSFER_RECEIVED',
    category: NotificationCategory.TRANSACTION,
    severity: NotificationSeverity.SUCCESS,
    urgent: true,
    fixture: {
      payerName: 'Ashcombe Design Ltd',
      amountFormatted: '£2,400.00',
      reference: 'Invoice 2026-114',
      balanceFormatted: '£4,718.42',
      receivedAt: '1 March 2026 at 09:04',
    },
    compose: (
      props: {
        payerName: string;
        amountFormatted: string;
        reference: string;
        balanceFormatted: string;
        receivedAt: string;
      },
      links,
    ) => ({
      subject: `${props.amountFormatted} from ${props.payerName}`,
      preheader: `Reference ${props.reference}. Balance now ${props.balanceFormatted}.`,
      heading: 'Money in',
      summary: `You received ${props.amountFormatted} from ${props.payerName}.`,
      nodes: [
        amount('Received', props.amountFormatted, AmountDirection.CREDIT),
        details([
          { label: 'From', value: props.payerName },
          { label: 'Reference', value: props.reference },
          { label: 'Received', value: props.receivedAt },
          { label: 'Balance after', value: props.balanceFormatted },
        ]),
        button(VIEW_TRANSACTIONS, links.app(TRANSACTIONS_PATH)),
      ],
      action: { label: VIEW_TRANSACTIONS, url: links.app(TRANSACTIONS_PATH) },
    }),
  }),

  TRANSFER_FAILED: defineTemplate({
    key: 'TRANSFER_FAILED',
    category: NotificationCategory.TRANSACTION,
    severity: NotificationSeverity.CRITICAL,
    urgent: true,
    fixture: {
      payeeName: 'Rosewood Lettings',
      amountFormatted: '£1,150.00',
      explanation: 'the available balance was too low when we tried to send it',
      nextStep: 'Pay in enough to cover it and send the payment again.',
    },
    compose: (
      props: {
        payeeName: string;
        amountFormatted: string;
        explanation: string;
        nextStep: string;
      },
      links,
    ) => ({
      subject: `We could not send ${props.amountFormatted} to ${props.payeeName}`,
      preheader: props.nextStep,
      heading: 'That payment did not go through',
      summary: `We could not send ${props.amountFormatted} to ${props.payeeName}.`,
      nodes: [
        paragraph(
          `We could not complete this payment because ${props.explanation}. The money has not left your account.`,
        ),
        details([
          { label: 'Was to be paid to', value: props.payeeName },
          { label: 'Amount', value: props.amountFormatted },
          { label: 'Status', value: 'Not sent' },
        ]),
        callout(Tone.CAUTION, props.nextStep),
        button('Try again', links.app('/transfers/new')),
      ],
      action: { label: 'Try again', url: links.app('/transfers/new') },
    }),
  }),

  STANDING_ORDER_DUE: defineTemplate({
    key: 'STANDING_ORDER_DUE',
    category: NotificationCategory.TRANSACTION,
    fixture: {
      payeeName: 'Rosewood Lettings',
      amountFormatted: '£1,150.00',
      dueDate: '1 April 2026',
      balanceFormatted: '£840.11',
    },
    compose: (
      props: {
        payeeName: string;
        amountFormatted: string;
        dueDate: string;
        balanceFormatted: string;
      },
      links,
    ) => ({
      subject: `${props.amountFormatted} leaves your account on ${props.dueDate}`,
      preheader: `Standing order to ${props.payeeName}.`,
      heading: 'A standing order is due',
      summary: `${props.amountFormatted} goes to ${props.payeeName} on ${props.dueDate}.`,
      nodes: [
        details([
          { label: 'Paying', value: props.payeeName },
          { label: 'Amount', value: props.amountFormatted },
          { label: 'Due', value: props.dueDate },
          { label: 'Balance today', value: props.balanceFormatted },
        ]),
        callout(
          Tone.CAUTION,
          'Your balance is currently below this amount. Pay in before the due date to avoid the payment being returned.',
        ),
        button('Manage standing orders', links.app('/payments/standing-orders')),
      ],
      action: { label: 'Manage standing orders', url: links.app('/payments/standing-orders') },
    }),
  }),
} as const;
