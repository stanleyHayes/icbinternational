/**
 * Opening an account: the messages between "I'd like to bank with you" and "your account
 * is open".
 *
 * The copy commits to specifics — how long a check takes, what happens next, what to do if
 * nothing does. A new customer's confidence in a bank is built almost entirely out of
 * whether the first four emails told the truth about timing.
 */

import { NotificationCategory, NotificationSeverity } from '@reliance/contracts';

import { defineTemplate } from '../define-template.js';
import { bullets, button, callout, code, details, paragraph, Tone } from '../render/email-node.js';

/** Both verification paths quote the same window, so it is stated once. */
const CODE_VALIDITY = 'This code is valid for 10 minutes.';

export const ONBOARDING_TEMPLATES = {
  WELCOME: defineTemplate({
    key: 'WELCOME',
    category: NotificationCategory.ACCOUNT,
    fixture: { firstName: 'Amara', accountName: 'Everyday Current Account' },
    compose: (props: { firstName: string; accountName: string }, links) => ({
      subject: `Welcome to Reliance Bank, ${props.firstName}`,
      preheader: 'Your account is open and ready to use.',
      heading: `Welcome, ${props.firstName}`,
      summary: `Your ${props.accountName} is open and ready to use.`,
      nodes: [
        paragraph(
          `Your ${props.accountName} is open. Your account number and sort code are in the app now, and your debit card is on its way — it usually arrives within three working days.`,
        ),
        paragraph('Three things worth doing in your first week:'),
        bullets([
          'Set up a standing order or move a direct debit across, so the account starts earning its place.',
          'Turn on payment notifications, so a card payment appears on your phone before the receipt prints.',
          'Add a passkey. It is faster than a password and cannot be phished.',
        ]),
        button('Open your account', links.app('/dashboard')),
      ],
      action: { label: 'Open your account', url: links.app('/dashboard') },
    }),
  }),

  VERIFY_EMAIL: defineTemplate({
    key: 'VERIFY_EMAIL',
    category: NotificationCategory.SECURITY,
    severity: NotificationSeverity.WARNING,
    urgent: true,
    fixture: { firstName: 'Amara', verifyUrl: 'https://app.reliancebank.example/verify?t=abc' },
    compose: (props: { firstName: string; verifyUrl: string }) => ({
      subject: 'Confirm your email address',
      preheader: 'One step left before we can open your account.',
      heading: 'Confirm your email address',
      summary: 'Confirm your email address to finish opening your account.',
      nodes: [
        paragraph(
          `${props.firstName}, please confirm this is your email address. We use it to send statements, payment confirmations and anything to do with the security of your account.`,
        ),
        button('Confirm my email address', props.verifyUrl),
        paragraph('The link is valid for 24 hours. After that, request a new one from the app.'),
        callout(
          Tone.CAUTION,
          'If you did not apply for an account with us, ignore this email and nothing further will happen.',
        ),
      ],
    }),
  }),

  EMAIL_VERIFIED: defineTemplate({
    key: 'EMAIL_VERIFIED',
    category: NotificationCategory.SECURITY,
    fixture: { email: 'a.okafor@example.com' },
    compose: (props: { email: string }, links) => ({
      subject: 'Your email address is confirmed',
      preheader: `${props.email} is now the address on your account.`,
      heading: 'Your email address is confirmed',
      summary: `${props.email} is now the address on your account.`,
      nodes: [
        paragraph(
          `We will send statements, payment confirmations and security notices to ${props.email}.`,
        ),
        paragraph(
          'If you did not make this change, call us straight away on 0800 019 4400. We answer 24 hours a day.',
        ),
        button('Review your security settings', links.app('/settings/security')),
      ],
    }),
  }),

  APPLICATION_RECEIVED: defineTemplate({
    key: 'APPLICATION_RECEIVED',
    category: NotificationCategory.ACCOUNT,
    fixture: {
      firstName: 'Amara',
      reference: 'RB-4417-2290',
      productName: 'Everyday Current Account',
    },
    compose: (props: { firstName: string; reference: string; productName: string }, links) => ({
      subject: `We have your application for a ${props.productName}`,
      preheader: `Reference ${props.reference}. Most decisions take under an hour.`,
      heading: 'We have your application',
      summary: `Your application for a ${props.productName} is with us. Reference ${props.reference}.`,
      nodes: [
        paragraph(
          `Thank you, ${props.firstName}. We are running the identity and affordability checks every bank is required to run before opening an account.`,
        ),
        details([
          { label: 'Product', value: props.productName },
          { label: 'Reference', value: props.reference },
          { label: 'Usual decision time', value: 'Under one hour' },
        ]),
        paragraph(
          'Most applications are decided within the hour. If we need a document from you we will email you, and the application waits until you send it.',
        ),
        button('Track your application', links.app('/onboarding')),
      ],
      action: { label: 'Track your application', url: links.app('/onboarding') },
    }),
  }),

  IDENTITY_CHECK_NEEDED: defineTemplate({
    key: 'IDENTITY_CHECK_NEEDED',
    category: NotificationCategory.ACCOUNT,
    severity: NotificationSeverity.WARNING,
    fixture: { firstName: 'Amara', documentsWanted: 'a passport or driving licence' },
    compose: (props: { firstName: string; documentsWanted: string }, links) => ({
      subject: 'We need one more thing to open your account',
      preheader: `Send us ${props.documentsWanted} and we will finish the checks.`,
      heading: 'We need one more thing',
      summary: `Send us ${props.documentsWanted} so we can finish opening your account.`,
      nodes: [
        paragraph(
          `${props.firstName}, our automated checks could not confirm your identity from the details you gave us. This is common and it is not a decision on your application.`,
        ),
        paragraph(`Please upload ${props.documentsWanted}. A clear photograph is fine.`),
        button('Upload your document', links.app('/onboarding/documents')),
        paragraph(
          'We review documents within two hours during the working day. Your application stays open in the meantime.',
        ),
      ],
      action: { label: 'Upload your document', url: links.app('/onboarding/documents') },
    }),
  }),

  ONE_TIME_PASSCODE_SIGNUP: defineTemplate({
    key: 'ONE_TIME_PASSCODE_SIGNUP',
    category: NotificationCategory.SECURITY,
    severity: NotificationSeverity.WARNING,
    urgent: true,
    fixture: { passcode: '481 902' },
    compose: (props: { passcode: string }) => ({
      subject: `${props.passcode} is your Reliance Bank code`,
      preheader: CODE_VALIDITY,
      heading: 'Your one-time code',
      summary: `Your one-time code is ${props.passcode}.`,
      nodes: [
        code(props.passcode, CODE_VALIDITY),
        callout(
          Tone.CRITICAL,
          'Nobody from Reliance Bank will ever ask you for this code — not on the phone, not by text, not by email. If someone asks, they are not us.',
        ),
      ],
    }),
  }),

  ACCOUNT_OPENED: defineTemplate({
    key: 'ACCOUNT_OPENED',
    category: NotificationCategory.ACCOUNT,
    severity: NotificationSeverity.SUCCESS,
    fixture: {
      accountName: 'Everyday Current Account',
      sortCode: '04-99-21',
      accountNumber: '•••• 4471',
      iban: 'GB29 RLNC 0499 2100 0044 71',
    },
    compose: (
      props: { accountName: string; sortCode: string; accountNumber: string; iban: string },
      links,
    ) => ({
      subject: `Your ${props.accountName} is open`,
      preheader: 'Your account details are below and in the app.',
      heading: `Your ${props.accountName} is open`,
      summary: `Your ${props.accountName} is open. Details are in the app.`,
      nodes: [
        paragraph('You can start paying in and paying out straight away.'),
        details([
          { label: 'Sort code', value: props.sortCode },
          { label: 'Account number', value: props.accountNumber },
          { label: 'IBAN', value: props.iban },
        ]),
        paragraph(
          'Your full account number is in the app. We only ever show the last four digits in an email.',
        ),
        button('View your account', links.app('/accounts')),
      ],
      action: { label: 'View your account', url: links.app('/accounts') },
    }),
  }),
} as const;
