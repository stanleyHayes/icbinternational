/**
 * How each simulated rail behaves out of the box.
 *
 * The failure rates are deliberately non-zero. A rail that never fails lets a UI ship
 * without a retry path, and the first real ACH return is then a production incident
 * rather than a state someone already designed.
 */

import type { RailBehaviour } from '@reliance/contracts';

const RAILS: readonly RailBehaviour[] = [
  { rail: 'ACH', failureRateBps: 100, latencyMinMs: 200, latencyMaxMs: 2_000, forceOutage: false },
  { rail: 'RTGS', failureRateBps: 50, latencyMinMs: 300, latencyMaxMs: 1_500, forceOutage: false },
  {
    rail: 'SWIFT',
    failureRateBps: 300,
    latencyMinMs: 800,
    latencyMaxMs: 9_000,
    forceOutage: false,
  },
  {
    rail: 'CARD_NETWORK',
    failureRateBps: 20,
    latencyMinMs: 50,
    latencyMaxMs: 400,
    forceOutage: false,
  },
  {
    rail: 'BILLER',
    failureRateBps: 500,
    latencyMinMs: 400,
    latencyMaxMs: 6_000,
    forceOutage: false,
  },
  { rail: 'SMS', failureRateBps: 200, latencyMinMs: 100, latencyMaxMs: 3_000, forceOutage: false },
  {
    rail: 'KYC_VENDOR',
    failureRateBps: 150,
    latencyMinMs: 500,
    latencyMaxMs: 5_000,
    forceOutage: false,
  },
];

/** A fresh, mutable copy of the default rail behaviour. */
export function defaultRails(): RailBehaviour[] {
  return RAILS.map((rail) => ({ ...rail }));
}
