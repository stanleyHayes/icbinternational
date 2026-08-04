/**
 * Money collected from the account by someone else, and money asked for.
 *
 * A Direct Debit message always restates the Guarantee. It is the customer's strongest
 * protection and the one most of them do not know they have, so it is repeated on every
 * collection rather than filed once in the terms.
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

export const COLLECTION_TEMPLATES = {
  DIRECT_DEBIT_COLLECTED: defineTemplate({
    key: 'DIRECT_DEBIT_COLLECTED',
    category: NotificationCategory.TRANSACTION,
    fixture: {
      originatorName: 'Northgate Energy',
      amountFormatted: '£94.20',
      collectedOn: '3 March 2026',
      mandateReference: 'NGE-88213',
    },
    compose: (
      props: {
        originatorName: string;
        amountFormatted: string;
        collectedOn: string;
        mandateReference: string;
      },
      links,
    ) => ({
      subject: `${props.originatorName} collected ${props.amountFormatted}`,
      preheader: `Direct Debit taken on ${props.collectedOn}.`,
      heading: 'A Direct Debit was collected',
      summary: `${props.originatorName} collected ${props.amountFormatted}.`,
      nodes: [
        amount('Collected', props.amountFormatted, AmountDirection.DEBIT),
        details([
          { label: 'Collected by', value: props.originatorName },
          { label: 'Date', value: props.collectedOn },
          { label: 'Mandate reference', value: props.mandateReference },
        ]),
        paragraph(
          'The Direct Debit Guarantee covers this payment. If an error is made, you are entitled to an immediate refund from us.',
        ),
        button('Manage your Direct Debits', links.app('/payments/direct-debits')),
      ],
    }),
  }),

  BILL_PAYMENT_CONFIRMED: defineTemplate({
    key: 'BILL_PAYMENT_CONFIRMED',
    category: NotificationCategory.TRANSACTION,
    severity: NotificationSeverity.SUCCESS,
    fixture: {
      billerName: 'Ashford Borough Council',
      amountFormatted: '£186.00',
      billerReference: '4471-2298-A',
      confirmationCode: 'BP-9K4X2',
    },
    compose: (
      props: {
        billerName: string;
        amountFormatted: string;
        billerReference: string;
        confirmationCode: string;
      },
      links,
    ) => ({
      subject: `${props.amountFormatted} paid to ${props.billerName}`,
      preheader: `Confirmation ${props.confirmationCode}.`,
      heading: 'Your bill is paid',
      summary: `You paid ${props.amountFormatted} to ${props.billerName}.`,
      nodes: [
        amount('Paid', props.amountFormatted, AmountDirection.DEBIT),
        details([
          { label: 'Paid to', value: props.billerName },
          { label: 'Your reference with them', value: props.billerReference },
          { label: 'Confirmation', value: props.confirmationCode },
        ]),
        paragraph(
          'Keep the confirmation code — the biller will ask for it if you query the payment.',
        ),
        button('Download a receipt', links.app('/transactions')),
      ],
    }),
  }),

  PAYMENT_REQUEST_RECEIVED: defineTemplate({
    key: 'PAYMENT_REQUEST_RECEIVED',
    category: NotificationCategory.TRANSACTION,
    fixture: {
      requesterName: 'Joel Adeyemi',
      amountFormatted: '£42.50',
      note: 'Dinner on Saturday',
      expiresOn: '21 March 2026',
    },
    compose: (
      props: { requesterName: string; amountFormatted: string; note: string; expiresOn: string },
      links,
    ) => ({
      subject: `${props.requesterName} asked you for ${props.amountFormatted}`,
      preheader: props.note,
      heading: 'Someone has asked you for money',
      summary: `${props.requesterName} requested ${props.amountFormatted}.`,
      nodes: [
        amount('Requested', props.amountFormatted, AmountDirection.PENDING),
        details([
          { label: 'From', value: props.requesterName },
          { label: 'Note', value: props.note },
          { label: 'Expires', value: props.expiresOn },
        ]),
        paragraph('Nothing leaves your account unless you approve it.'),
        button('Review the request', links.app('/payments/requests')),
      ],
      action: { label: 'Review the request', url: links.app('/payments/requests') },
    }),
  }),

  PAYEE_ADDED: defineTemplate({
    key: 'PAYEE_ADDED',
    category: NotificationCategory.SECURITY,
    severity: NotificationSeverity.WARNING,
    urgent: true,
    fixture: {
      payeeName: 'M Thornbury',
      maskedDestination: '04-99-21 · •••• 8820',
      addedAt: '14 March 2026 at 22:41',
    },
    compose: (props: { payeeName: string; maskedDestination: string; addedAt: string }, links) => ({
      subject: `${props.payeeName} was added to your payees`,
      preheader: 'Check this is someone you meant to add.',
      heading: 'A new payee was added',
      summary: `${props.payeeName} was added to your payees.`,
      nodes: [
        details([
          { label: 'Payee', value: props.payeeName },
          { label: 'Account', value: props.maskedDestination },
          { label: 'Added', value: props.addedAt },
        ]),
        paragraph(
          'A new payee followed quickly by a large payment is the most common pattern in an account takeover, which is why we always tell you.',
        ),
        callout(
          Tone.CRITICAL,
          'If you did not add this payee, call us on 0800 019 4400 now. Do not send them anything.',
        ),
        button('Review your payees', links.app('/payees')),
      ],
      action: { label: 'Review your payees', url: links.app('/payees') },
    }),
  }),
} as const;
