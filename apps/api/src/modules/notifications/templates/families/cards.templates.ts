/**
 * The debit card: ordering it, receiving it, using it, and stopping it.
 *
 * Card numbers never appear. The last four digits identify the card to its holder and are
 * useless to anyone else; a full PAN in an email is a full PAN in an inbox, a backup and a
 * mail provider's index.
 */

import { NotificationCategory, NotificationSeverity } from '@reliance/contracts';

import { defineTemplate } from '../define-template.js';
import {
  AmountDirection,
  amount,
  bullets,
  button,
  callout,
  details,
  paragraph,
  Tone,
} from '../render/email-node.js';

const MANAGE_CARD = 'Manage your card';
const CARD_PATH = '/cards';

export const CARD_TEMPLATES = {
  CARD_ORDERED: defineTemplate({
    key: 'CARD_ORDERED',
    category: NotificationCategory.CARD,
    fixture: { cardLast4: '4471', deliveryEstimate: '18–20 March' },
    compose: (props: { cardLast4: string; deliveryEstimate: string }, links) => ({
      subject: 'Your debit card is on its way',
      preheader: `Expected ${props.deliveryEstimate}.`,
      heading: 'Your card is on its way',
      summary: `Your card ending ${props.cardLast4} is on its way.`,
      nodes: [
        paragraph(
          `Your card ending ${props.cardLast4} has been produced and posted to the address on your account. It should arrive ${props.deliveryEstimate}.`,
        ),
        paragraph(
          'Your PIN is in the app now — we do not post it separately. You can also add the card to Apple Pay or Google Pay and start spending before the plastic arrives.',
        ),
        button(MANAGE_CARD, links.app(CARD_PATH)),
      ],
      action: { label: MANAGE_CARD, url: links.app(CARD_PATH) },
    }),
  }),

  CARD_ACTIVATED: defineTemplate({
    key: 'CARD_ACTIVATED',
    category: NotificationCategory.CARD,
    severity: NotificationSeverity.SUCCESS,
    fixture: { cardLast4: '4471' },
    compose: (props: { cardLast4: string }, links) => ({
      subject: `Your card ending ${props.cardLast4} is active`,
      preheader: 'Ready for shops, online and cash machines.',
      heading: 'Your card is active',
      summary: `Your card ending ${props.cardLast4} is now active.`,
      nodes: [
        paragraph('You can use it in shops, online and at any cash machine.'),
        bullets([
          'Contactless works up to £100 per payment, and we may ask for your PIN from time to time.',
          'Your PIN is in the app under Cards, and you can change it there.',
          'Freeze the card instantly from the app if you mislay it — freezing is reversible, cancelling is not.',
        ]),
        button(MANAGE_CARD, links.app(CARD_PATH)),
      ],
    }),
  }),

  CARD_AUTHORISATION: defineTemplate({
    key: 'CARD_AUTHORISATION',
    category: NotificationCategory.CARD,
    urgent: true,
    fixture: {
      merchantName: 'Corner Larder',
      amountFormatted: '£23.85',
      cardLast4: '4471',
      availableFormatted: '£2,294.57',
      authorisedAt: '18:44',
    },
    compose: (
      props: {
        merchantName: string;
        amountFormatted: string;
        cardLast4: string;
        availableFormatted: string;
        authorisedAt: string;
      },
      links,
    ) => ({
      subject: `${props.amountFormatted} at ${props.merchantName}`,
      preheader: `Card ending ${props.cardLast4}. Available balance ${props.availableFormatted}.`,
      heading: 'Card payment authorised',
      summary: `${props.amountFormatted} at ${props.merchantName} on your card ending ${props.cardLast4}.`,
      nodes: [
        amount('Authorised', props.amountFormatted, AmountDirection.DEBIT),
        details([
          { label: 'Merchant', value: props.merchantName },
          { label: 'Card', value: `Ending ${props.cardLast4}` },
          { label: 'Time', value: props.authorisedAt },
          { label: 'Available balance', value: props.availableFormatted },
        ]),
        paragraph(
          'The merchant has reserved this amount. It becomes a completed payment when they claim it, usually within a few days, and the final figure can differ at a hotel or a fuel pump.',
        ),
        button('See this payment', links.app('/transactions')),
      ],
      action: { label: 'See this payment', url: links.app('/transactions') },
    }),
  }),

  CARD_DECLINED: defineTemplate({
    key: 'CARD_DECLINED',
    category: NotificationCategory.CARD,
    severity: NotificationSeverity.WARNING,
    urgent: true,
    fixture: {
      merchantName: 'Northbound Travel',
      amountFormatted: '£312.00',
      cardLast4: '4471',
      explanation: 'the available balance was not enough to cover it',
      remedy: 'Pay in and try again, or use another card.',
    },
    compose: (
      props: {
        merchantName: string;
        amountFormatted: string;
        cardLast4: string;
        explanation: string;
        remedy: string;
      },
      links,
    ) => ({
      subject: `Card payment declined at ${props.merchantName}`,
      preheader: props.remedy,
      heading: 'A card payment was declined',
      summary: `${props.amountFormatted} at ${props.merchantName} was declined.`,
      nodes: [
        paragraph(
          `We declined a payment of ${props.amountFormatted} at ${props.merchantName} on your card ending ${props.cardLast4} because ${props.explanation}.`,
        ),
        callout(Tone.CAUTION, props.remedy),
        paragraph('Nothing has been taken from your account.'),
        button('Check your card settings', links.app(CARD_PATH)),
      ],
      action: { label: 'Check your card settings', url: links.app(CARD_PATH) },
    }),
  }),

  CARD_FROZEN: defineTemplate({
    key: 'CARD_FROZEN',
    category: NotificationCategory.CARD,
    severity: NotificationSeverity.WARNING,
    urgent: true,
    fixture: { cardLast4: '4471', frozenAt: '14 March 2026 at 23:02', frozenBy: 'you, in the app' },
    compose: (props: { cardLast4: string; frozenAt: string; frozenBy: string }, links) => ({
      subject: `Your card ending ${props.cardLast4} is frozen`,
      preheader: 'No new payments will be authorised until you unfreeze it.',
      heading: 'Your card is frozen',
      summary: `Your card ending ${props.cardLast4} is frozen.`,
      nodes: [
        details([
          { label: 'Card', value: `Ending ${props.cardLast4}` },
          { label: 'Frozen', value: props.frozenAt },
          { label: 'Frozen by', value: props.frozenBy },
        ]),
        paragraph(
          'No new payments will be authorised. Direct Debits and standing orders are unaffected — they do not run on your card.',
        ),
        paragraph('Unfreeze it in the app the moment you find it. Nothing is lost by freezing.'),
        button('Unfreeze your card', links.app(CARD_PATH)),
      ],
      action: { label: 'Unfreeze your card', url: links.app(CARD_PATH) },
    }),
  }),

  CARD_REPORTED: defineTemplate({
    key: 'CARD_REPORTED',
    category: NotificationCategory.CARD,
    severity: NotificationSeverity.CRITICAL,
    urgent: true,
    fixture: { cardLast4: '4471', replacementLast4: '9038', deliveryEstimate: '19–21 March' },
    compose: (
      props: { cardLast4: string; replacementLast4: string; deliveryEstimate: string },
      links,
    ) => ({
      subject: `Card ending ${props.cardLast4} cancelled, replacement on its way`,
      preheader: `New card ending ${props.replacementLast4}, expected ${props.deliveryEstimate}.`,
      heading: 'Your card has been cancelled',
      summary: `Card ending ${props.cardLast4} is cancelled. A replacement is on its way.`,
      nodes: [
        paragraph(
          `Your card ending ${props.cardLast4} is permanently cancelled and cannot be used again, including anywhere it was stored online.`,
        ),
        details([
          { label: 'Replacement card', value: `Ending ${props.replacementLast4}` },
          { label: 'Expected', value: props.deliveryEstimate },
        ]),
        paragraph(
          'Subscriptions and recurring payments on the old card will fail. Update them with the new card details once it arrives.',
        ),
        callout(
          Tone.CRITICAL,
          'If you see a payment you do not recognise, tell us within 13 months and we will investigate and refund anything you did not authorise.',
        ),
        button('See your cards', links.app(CARD_PATH)),
      ],
    }),
  }),

  CARD_CONTROLS_CHANGED: defineTemplate({
    key: 'CARD_CONTROLS_CHANGED',
    category: NotificationCategory.CARD,
    fixture: {
      cardLast4: '4471',
      changeDescription: 'Online payments switched on',
      changedAt: '14 March 2026 at 23:15',
    },
    compose: (
      props: { cardLast4: string; changeDescription: string; changedAt: string },
      links,
    ) => ({
      subject: `Card settings changed: ${props.changeDescription.toLowerCase()}`,
      preheader: `Card ending ${props.cardLast4}.`,
      heading: 'Your card settings changed',
      summary: `${props.changeDescription} on your card ending ${props.cardLast4}.`,
      nodes: [
        details([
          { label: 'Card', value: `Ending ${props.cardLast4}` },
          { label: 'Change', value: props.changeDescription },
          { label: 'When', value: props.changedAt },
        ]),
        callout(
          Tone.CAUTION,
          'If this was not you, freeze the card in the app and call us on 0800 019 4400.',
        ),
        button(MANAGE_CARD, links.app(CARD_PATH)),
      ],
    }),
  }),
} as const;
