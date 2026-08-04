/**
 * The brand, expressed as the subset of CSS an email client will actually honour.
 *
 * Values are transcribed from `brand/tokens/brand.tokens.json`. They are duplicated here
 * rather than imported because the token file is a design-system artefact consumed by
 * `packages/ui` through a build step, and an email is rendered on the server with no
 * build step in front of it. The duplication is deliberate and narrow: colour and type
 * only, and every value is named after the token it came from.
 *
 * Everything is inline-safe. No custom properties, no `rem`, no shorthand an Outlook
 * renderer will discard, and no web font that a client is entitled to ignore — Outfit is
 * requested first and a system stack carries the message when it is not available.
 */

export const EMAIL_THEME = Object.freeze({
  /** `typography.fontFamily.body`, with the fallbacks a mail client needs. */
  fontStack:
    "'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  monoStack: "'JetBrains Mono', 'SFMono-Regular', Consolas, 'Liberation Mono', monospace",

  navy900: '#062036',
  navy800: '#082B49',
  navy700: '#0B3A63',
  navy600: '#164778',
  navy50: '#EEF4FA',

  slate50: '#F7F9FB',
  slate100: '#EDF1F6',
  slate200: '#DDE4EC',
  slate400: '#93A3B6',
  slate500: '#697B90',
  slate600: '#4D5D70',
  slate800: '#26303C',

  credit: '#00A578',
  debit: '#D9534F',
  pending: '#D8B54A',
  danger: '#C6362F',
  warning: '#D98A22',
  info: '#2A5D93',

  white: '#FFFFFF',
  radius: '10px',
  radiusSmall: '6px',
} as const);

/** Content column width in pixels — the width every mail client agrees on. */
export const CONTENT_WIDTH = 600;

/** Registered details of the sender, shown in the footer the way a bank's email does. */
export const BANK_IDENTITY = Object.freeze({
  name: 'Reliance Bank',
  legalName: 'Reliance Bank plc',
  addressLine: '1 Cornhill Yard, London EC3V 3ND, United Kingdom',
  registration: 'Registered in England and Wales, company number 08214477.',
  regulator:
    'Authorised by the Prudential Regulation Authority and regulated by the Financial Conduct Authority and the Prudential Regulation Authority.',
  protection:
    'Eligible deposits are protected by the Financial Services Compensation Scheme up to £85,000 per depositor.',
  supportEmail: 'support@reliancebank.example',
  supportPhone: '0800 019 4400',
} as const);
