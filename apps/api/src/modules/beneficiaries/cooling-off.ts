import { Money, type CurrencyCode } from '@reliance/money';

import { COOLING_OFF_THRESHOLD_MAJOR, STEP_UP_THRESHOLD_MAJOR } from './beneficiary.constants.js';

/**
 * The new-payee cooling-off rule, as pure arithmetic over dates and amounts.
 *
 * Kept free of the database and the framework because it is the rule most likely to be
 * argued about in a complaint: "why was my payment refused at 11pm and allowed at 9am?"
 * needs an answer that can be read off a function, not reconstructed from a service.
 *
 * The rule is deliberately a *ceiling*, not a block. A brand-new payee can be paid
 * immediately — just not a large amount. Blocking outright would push customers to move
 * the money some other way, which is worse for them and blinder for the bank.
 */

/** How a payee stands relative to their cooling-off window. */
export const PayeeTrust = {
  /** The customer's own account. Cooling-off does not apply to moving your own money. */
  OWN_ACCOUNT: 'OWN_ACCOUNT',
  /** Saved long enough ago that the window has passed. */
  TRUSTED: 'TRUSTED',
  /** Saved, but still inside the window. */
  COOLING_OFF: 'COOLING_OFF',
  /** Never saved at all — an ad-hoc destination, which is as new as a payee gets. */
  UNKNOWN: 'UNKNOWN',
} as const;
export type PayeeTrust = (typeof PayeeTrust)[keyof typeof PayeeTrust];

/** The ceiling that applies to an untrusted payee, in the currency being sent. */
export function coolingOffCeiling(currency: CurrencyCode): Money {
  return Money.fromMajor(COOLING_OFF_THRESHOLD_MAJOR, currency);
}

/** The amount at or above which a fresh step-up is demanded regardless of trust. */
export function stepUpCeiling(currency: CurrencyCode): Money {
  return Money.fromMajor(STEP_UP_THRESHOLD_MAJOR, currency);
}

/**
 * Where a payee sits, given when their record says they became trusted.
 *
 * @param trustedFrom The instant the window closes, or null for a payee with no record.
 */
export function trustOf(input: {
  ownAccount: boolean;
  trustedFrom: Date | null;
  now: Date;
}): PayeeTrust {
  if (input.ownAccount) return PayeeTrust.OWN_ACCOUNT;
  if (input.trustedFrom === null) return PayeeTrust.UNKNOWN;
  return input.trustedFrom.getTime() <= input.now.getTime()
    ? PayeeTrust.TRUSTED
    : PayeeTrust.COOLING_OFF;
}

/** Whether `amount` is within what an untrusted payee may receive. */
export function withinCoolingOffCeiling(trust: PayeeTrust, amount: Money): boolean {
  if (trust === PayeeTrust.OWN_ACCOUNT || trust === PayeeTrust.TRUSTED) return true;
  return amount.lessThanOrEqual(coolingOffCeiling(amount.currency));
}

/**
 * Whether the payment needs a fresh authentication before it may be sent.
 *
 * Two independent triggers, because they cover different attacks: a large payment to a
 * long-standing payee is the shape of a hijacked session, and any payment to a payee the
 * customer has never used is the shape of a scam call in progress.
 */
export function requiresStepUp(trust: PayeeTrust, amount: Money): boolean {
  if (amount.greaterThanOrEqual(stepUpCeiling(amount.currency))) return true;
  return trust === PayeeTrust.COOLING_OFF || trust === PayeeTrust.UNKNOWN;
}
