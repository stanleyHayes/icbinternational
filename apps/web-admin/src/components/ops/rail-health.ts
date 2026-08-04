/**
 * How the bank's counterparty rails are named and judged.
 *
 * The contract identifies a rail by the network it is — `ACH`, `SWIFT`, `CARD_NETWORK`.
 * An operator on the phone to a clearing desk needs the name the desk uses, so the label
 * is written out rather than derived from the enum, and the health is stated in the three
 * words an incident bridge understands.
 */

import type { RailBehaviour } from '@reliance/contracts';
import type { Tone } from '@reliance/ui';

/** Every rail the platform reports on. */
export type RailName = RailBehaviour['rail'];

const LABELS: Readonly<Record<RailName, string>> = {
  ACH: 'Domestic ACH clearing',
  RTGS: 'Domestic RTGS settlement',
  SWIFT: 'International SWIFT',
  CARD_NETWORK: 'Card scheme network',
  BILLER: 'Biller network',
  SMS: 'Message gateway',
  KYC_VENDOR: 'Identity verification service',
};

const DESCRIPTIONS: Readonly<Record<RailName, string>> = {
  ACH: 'Batched domestic credit transfers, cut off three times a business day.',
  RTGS: 'High-value domestic payments settled individually and in real time.',
  SWIFT: 'Cross-border payments and the correspondent nostro leg.',
  CARD_NETWORK: 'Authorisation, clearing and settlement with the card schemes.',
  BILLER: 'Bill payments and top-ups presented to biller aggregators.',
  SMS: 'One-time codes and payment alerts to customer handsets.',
  KYC_VENDOR: 'Document and identity checks during onboarding.',
};

/** Failure rate at or above which a rail is reported as degraded, in basis points. */
const DEGRADED_FROM_BPS = 200;

/** Round-trip latency at or above which a rail is reported as slow, in milliseconds. */
const SLOW_FROM_MS = 4000;

/** The operational state of one rail, in words and in colour. */
export interface RailStatus {
  readonly label: string;
  readonly tone: Tone;
  /** What an operator should do about it, or what it means that nothing is wrong. */
  readonly detail: string;
}

/** The rail's name as the clearing desk would say it. */
export function railLabel(rail: RailName): string {
  return LABELS[rail];
}

/** What the rail carries. */
export function railDescription(rail: RailName): string {
  return DESCRIPTIONS[rail];
}

/** The rail's current state, judged from its reported failure rate and latency. */
export function railStatus(behaviour: RailBehaviour): RailStatus {
  if (behaviour.forceOutage) {
    return {
      label: 'Unavailable',
      tone: 'danger',
      detail: 'Nothing is being sent. Queued items will be presented when the rail returns.',
    };
  }

  if (behaviour.failureRateBps >= DEGRADED_FROM_BPS) {
    return {
      label: 'Degraded',
      tone: 'warning',
      detail: 'Items are being returned more often than usual. Reversals are posting normally.',
    };
  }

  if (behaviour.latencyMaxMs >= SLOW_FROM_MS) {
    return {
      label: 'Slow',
      tone: 'pending',
      detail: 'Responses are within tolerance but slower than the agreed service level.',
    };
  }

  return { label: 'Operational', tone: 'success', detail: 'Responding within the service level.' };
}
