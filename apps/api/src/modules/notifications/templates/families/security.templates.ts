/**
 * Security notices. Every template here is `SECURITY`, and every one of them reaches the
 * customer whatever they have muted.
 *
 * Two conventions run through the copy and both are deliberate. Each message states what
 * to do if it was *not* you, with a phone number rather than a link — a customer who has
 * just been phished should not be asked to trust another link. And none of them asks the
 * customer to confirm anything by replying, because a bank that sometimes does that
 * teaches its customers that a message asking them to is plausible.
 */

import { NotificationCategory, NotificationSeverity } from '@reliance/contracts';

import { defineTemplate } from '../define-template.js';
import { button, callout, code, details, paragraph, Tone } from '../render/email-node.js';

const NOT_YOU =
  'If this was not you, call us on 0800 019 4400 straight away. We answer 24 hours a day.';
const NEVER_ASK =
  'Nobody from Reliance Bank will ever ask you for this code, your full password or your PIN.';

export const SECURITY_TEMPLATES = {
  ONE_TIME_PASSCODE: defineTemplate({
    key: 'ONE_TIME_PASSCODE',
    category: NotificationCategory.SECURITY,
    severity: NotificationSeverity.WARNING,
    urgent: true,
    fixture: { passcode: '204 771', purpose: 'confirm this payment' },
    compose: (props: { passcode: string; purpose: string }) => ({
      subject: `${props.passcode} is your Reliance Bank code`,
      preheader: `Use it to ${props.purpose}. It expires in 10 minutes.`,
      heading: 'Your one-time code',
      summary: `Your one-time code is ${props.passcode}.`,
      nodes: [
        paragraph(`Use this code to ${props.purpose}.`),
        code(props.passcode, 'This code expires in 10 minutes and can be used once.'),
        callout(Tone.CRITICAL, NEVER_ASK),
      ],
    }),
  }),

  LOGIN_ALERT: defineTemplate({
    key: 'LOGIN_ALERT',
    category: NotificationCategory.SECURITY,
    severity: NotificationSeverity.WARNING,
    urgent: true,
    fixture: {
      deviceLabel: 'Chrome on Windows',
      location: 'Manchester, United Kingdom',
      signedInAt: '14 March 2026 at 21:04',
      ipAddress: '81.***.***.114',
    },
    compose: (
      props: { deviceLabel: string; location: string; signedInAt: string; ipAddress: string },
      links,
    ) => ({
      subject: 'New sign-in to your Reliance Bank account',
      preheader: `${props.deviceLabel} · ${props.location}`,
      heading: 'Someone signed in to your account',
      summary: `New sign-in from ${props.deviceLabel} in ${props.location}.`,
      nodes: [
        paragraph('We noticed a sign-in from a device we have not seen on your account before.'),
        details([
          { label: 'Device', value: props.deviceLabel },
          { label: 'Location', value: props.location },
          { label: 'Time', value: props.signedInAt },
          { label: 'IP address', value: props.ipAddress },
        ]),
        paragraph('If that was you, there is nothing to do.'),
        callout(Tone.CRITICAL, NOT_YOU),
        button('Review your active sessions', links.app('/settings/security/sessions')),
      ],
      action: {
        label: 'Review your active sessions',
        url: links.app('/settings/security/sessions'),
      },
    }),
  }),

  DEVICE_TRUSTED: defineTemplate({
    key: 'DEVICE_TRUSTED',
    category: NotificationCategory.SECURITY,
    fixture: { deviceLabel: 'iPhone 15', trustedAt: '14 March 2026 at 21:06' },
    compose: (props: { deviceLabel: string; trustedAt: string }, links) => ({
      subject: `${props.deviceLabel} is now a trusted device`,
      preheader: 'You will not be asked for a code on this device for 30 days.',
      heading: 'A device was added to your trusted list',
      summary: `${props.deviceLabel} was added to your trusted devices.`,
      nodes: [
        details([
          { label: 'Device', value: props.deviceLabel },
          { label: 'Added', value: props.trustedAt },
          { label: 'Trusted until', value: '30 days from now' },
        ]),
        paragraph(
          'We will not ask for a one-time code when you sign in on this device for the next 30 days. You can remove it at any time.',
        ),
        callout(Tone.CAUTION, NOT_YOU),
        button('Manage trusted devices', links.app('/settings/security/devices')),
      ],
    }),
  }),

  PASSWORD_CHANGED: defineTemplate({
    key: 'PASSWORD_CHANGED',
    category: NotificationCategory.SECURITY,
    severity: NotificationSeverity.WARNING,
    urgent: true,
    fixture: { changedAt: '14 March 2026 at 21:12' },
    compose: (props: { changedAt: string }) => ({
      subject: 'Your password was changed',
      preheader: `Changed on ${props.changedAt}.`,
      heading: 'Your password was changed',
      summary: `Your password was changed on ${props.changedAt}.`,
      nodes: [
        paragraph(
          `The password on your Reliance Bank account was changed on ${props.changedAt}. Every other device has been signed out.`,
        ),
        callout(Tone.CRITICAL, NOT_YOU),
      ],
    }),
  }),

  PASSWORD_RESET_REQUESTED: defineTemplate({
    key: 'PASSWORD_RESET_REQUESTED',
    category: NotificationCategory.SECURITY,
    severity: NotificationSeverity.WARNING,
    urgent: true,
    fixture: { resetUrl: 'https://app.reliancebank.example/reset?t=xyz' },
    compose: (props: { resetUrl: string }) => ({
      subject: 'Reset your Reliance Bank password',
      preheader: 'The link works once and expires in 30 minutes.',
      heading: 'Reset your password',
      summary: 'A password reset was requested for your account.',
      nodes: [
        paragraph('Someone asked to reset the password on your account. If it was you, carry on.'),
        button('Choose a new password', props.resetUrl),
        paragraph('This link can be used once and expires in 30 minutes.'),
        callout(
          Tone.CRITICAL,
          'If you did not ask for this, do not use the link. Your password has not changed. Call us on 0800 019 4400 so we can check the account.',
        ),
      ],
    }),
  }),

  TWO_FACTOR_CHANGED: defineTemplate({
    key: 'TWO_FACTOR_CHANGED',
    category: NotificationCategory.SECURITY,
    severity: NotificationSeverity.WARNING,
    urgent: true,
    fixture: { method: 'Authenticator app', enabled: true, changedAt: '14 March 2026 at 21:20' },
    compose: (props: { method: string; enabled: boolean; changedAt: string }, links) => ({
      subject: props.enabled
        ? `${props.method} is now protecting your account`
        : `${props.method} was switched off`,
      preheader: `Changed on ${props.changedAt}.`,
      heading: props.enabled
        ? 'Two-step verification is on'
        : 'Two-step verification was switched off',
      summary: props.enabled
        ? `${props.method} is now protecting your account.`
        : `${props.method} was switched off on your account.`,
      nodes: [
        details([
          { label: 'Method', value: props.method },
          { label: 'Status', value: props.enabled ? 'Switched on' : 'Switched off' },
          { label: 'Changed', value: props.changedAt },
        ]),
        props.enabled
          ? paragraph(
              'You will be asked for a code from this method when you sign in on a new device or move a large amount.',
            )
          : callout(
              Tone.CRITICAL,
              'Your account is now protected by your password alone. We strongly recommend switching a second step back on.',
            ),
        callout(Tone.CAUTION, NOT_YOU),
        button('Security settings', links.app('/settings/security')),
      ],
    }),
  }),
} as const;
