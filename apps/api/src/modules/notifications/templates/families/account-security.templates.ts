/**
 * Account-protection notices: passkeys, lockouts and a payment we have stopped.
 *
 * Continues `security.templates.ts`, and holds to the same two conventions — every message
 * says what to do if it was not you, with a phone number rather than a link, and none of
 * them asks the customer to confirm anything by replying.
 */

import { NotificationCategory, NotificationSeverity } from '@reliance/contracts';

import { defineTemplate } from '../define-template.js';
import { bullets, button, callout, details, paragraph, Tone } from '../render/email-node.js';

const NOT_YOU =
  'If this was not you, call us on 0800 019 4400 straight away. We answer 24 hours a day.';

export const ACCOUNT_SECURITY_TEMPLATES = {
  PASSKEY_ADDED: defineTemplate({
    key: 'PASSKEY_ADDED',
    category: NotificationCategory.SECURITY,
    fixture: { passkeyLabel: 'iPhone 15 · Face ID', addedAt: '14 March 2026 at 21:24' },
    compose: (props: { passkeyLabel: string; addedAt: string }, links) => ({
      subject: 'A passkey was added to your account',
      preheader: `${props.passkeyLabel} can now sign you in.`,
      heading: 'A passkey was added',
      summary: `${props.passkeyLabel} was added as a passkey.`,
      nodes: [
        details([
          { label: 'Passkey', value: props.passkeyLabel },
          { label: 'Added', value: props.addedAt },
        ]),
        paragraph(
          'A passkey signs you in with your fingerprint, face or device PIN. It never leaves your device and cannot be phished, which makes it the strongest sign-in we offer.',
        ),
        callout(Tone.CAUTION, NOT_YOU),
        button('Manage passkeys', links.app('/settings/security/passkeys')),
      ],
    }),
  }),

  ACCOUNT_LOCKED: defineTemplate({
    key: 'ACCOUNT_LOCKED',
    category: NotificationCategory.SECURITY,
    severity: NotificationSeverity.CRITICAL,
    urgent: true,
    fixture: { reason: 'five incorrect password attempts', unlockAt: '21:45 today' },
    compose: (props: { reason: string; unlockAt: string }) => ({
      subject: 'We have locked your account for now',
      preheader: `Access returns at ${props.unlockAt}.`,
      heading: 'We have locked your account',
      summary: `Your account is locked after ${props.reason}.`,
      nodes: [
        paragraph(
          `We locked your account after ${props.reason}. This is a precaution: your money is untouched and nothing has been moved.`,
        ),
        paragraph(`Access returns automatically at ${props.unlockAt}.`),
        bullets([
          'If it was you and you have forgotten your password, reset it from the sign-in screen.',
          'If it was not you, call us on 0800 019 4400 and we will check the account with you.',
        ]),
      ],
    }),
  }),

  SUSPICIOUS_ACTIVITY_HOLD: defineTemplate({
    key: 'SUSPICIOUS_ACTIVITY_HOLD',
    category: NotificationCategory.SECURITY,
    severity: NotificationSeverity.CRITICAL,
    urgent: true,
    fixture: { merchantName: 'Voyage Rail Ltd', amountFormatted: '£1,240.00', placedAt: '14:02' },
    compose: (
      props: { merchantName: string; amountFormatted: string; placedAt: string },
      links,
    ) => ({
      subject: 'We have paused a payment on your account',
      preheader: `${props.amountFormatted} to ${props.merchantName} is on hold.`,
      heading: 'We have paused a payment',
      summary: `A payment of ${props.amountFormatted} to ${props.merchantName} is on hold.`,
      nodes: [
        paragraph(
          'Something about this payment did not match how your account is normally used, so we have held it until you tell us it is genuine.',
        ),
        details([
          { label: 'Paid to', value: props.merchantName },
          { label: 'Amount', value: props.amountFormatted },
          { label: 'Held at', value: props.placedAt },
        ]),
        paragraph(
          'Nothing has left your account. Confirm it in the app and we will release it immediately, or tell us it was not you and we will block the payment and review the account with you.',
        ),
        button('Review this payment', links.app('/security/reviews')),
      ],
      action: { label: 'Review this payment', url: links.app('/security/reviews') },
    }),
  }),
} as const;
