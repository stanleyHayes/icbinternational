/**
 * The card scheme, simulated.
 *
 * Everything the bank cannot decide for itself lives here: the reference the scheme
 * assigns, whether the switch is reachable, whether strong customer authentication is
 * demanded, how long an approval survives unclaimed, and how a challenge ends.
 *
 * Every one of those is a pure function of the configured seed and a key naming the
 * decision. Re-running a scenario therefore produces the same references, the same
 * challenges and the same outages — which is the difference between a simulator you can
 * write a regression test against and a random number generator with a logo on it.
 */

import { Injectable } from '@nestjs/common';

import { type CardScheme } from '@reliance/contracts';

import { AppConfigService } from '../../config/config.service.js';

import {
  AUTHORISATION_VALIDITY_HOURS,
  BASIS_POINTS_TOTAL,
  CLEARING_REFERENCE_PREFIX,
  LOW_VALUE_EXEMPTION_MINOR,
  NETWORK_REFERENCE_LENGTH,
  NETWORK_REFERENCE_PREFIX,
  REFERENCE_ALPHABET,
  THREE_DS_SAMPLING_BPS,
  type CardChannel,
} from './card-network.constants.js';
import { seededChance, seededInt, seededString } from './deterministic-random.js';
import {
  ThreeDsOutcome,
  ThreeDsRequirement,
  type NetworkAuthorisationContext,
  type NetworkAuthorisationRequest,
} from './network-message.js';

/** Milliseconds in an hour, for turning a scheme validity window into an instant. */
const MILLISECONDS_PER_HOUR = 3_600_000;

/** Channels that carry a cardholder present at the terminal, so 3DS does not apply. */
const CARDHOLDER_PRESENT_CHANNELS: readonly CardChannel[] = [
  'CONTACTLESS',
  'CHIP',
  'MAGSTRIPE',
  'ATM',
];

/** How often a challenge the cardholder starts is abandoned rather than completed. */
const CHALLENGE_ABANDON_BPS = 800;

/** How often a completed challenge fails, e.g. the wrong passcode three times over. */
const CHALLENGE_FAILURE_BPS = 400;

@Injectable()
export class CardNetworkSimulator {
  /** The scenario seed. Two runs under the same seed are indistinguishable. */
  private readonly seed: string;

  /** How often the switch is unreachable, in basis points of attempts. */
  private readonly outageBps: number;

  private readonly latencyMinMs: number;
  private readonly latencyMaxMs: number;

  constructor(config: AppConfigService) {
    const simulation = config.simulation;
    this.seed = simulation.seed;
    this.outageBps = simulation.railFailureBps;
    this.latencyMinMs = simulation.latencyMinMs;
    this.latencyMaxMs = simulation.latencyMaxMs;
  }

  /**
   * Everything the scheme contributes to one authorisation attempt.
   *
   * @param key Uniquely names this attempt — normally the authorisation's own id. The
   *   same key always yields the same context, which is what makes a replay a replay.
   */
  authorisationContext(input: {
    key: string;
    request: NetworkAuthorisationRequest;
    scheme: CardScheme;
    at: Date;
  }): NetworkAuthorisationContext {
    return {
      networkReference: this.networkReference(input.key),
      scheme: input.scheme,
      threeDs: this.threeDsRequirement(input.key, input.request),
      expiresAt: this.expiryFor(input.request.channel, input.at),
      latencyMs: this.latencyFor(input.key),
      issuerReachable: this.isIssuerReachable(input.key),
    };
  }

  /** The scheme's acquirer reference number for a message. */
  networkReference(key: string): string {
    return `${NETWORK_REFERENCE_PREFIX}${this.digits(scoped('arn', key))}`;
  }

  /** The presentment reference the acquirer quotes when it clears an authorisation. */
  clearingReference(key: string): string {
    return `${CLEARING_REFERENCE_PREFIX}${this.digits(scoped('clr', key))}`;
  }

  /**
   * Whether the switch answers at all.
   *
   * A card system that never has an outage teaches a client nothing about how to behave
   * during one, so a configurable share of attempts get no answer and are declined
   * `ISSUER_UNAVAILABLE` — which the terminal is told it may retry.
   */
  isIssuerReachable(key: string): boolean {
    return !seededChance(this.seed, `outage:${key}`, this.outageBps, BASIS_POINTS_TOTAL);
  }

  /**
   * Whether this payment needs a 3DS challenge.
   *
   * Card-present payments never do — the cardholder is standing at the terminal with the
   * card in their hand, which is the authentication. Remote payments do, unless they fall
   * under the low-value exemption, and even then a deterministic sample is challenged so
   * that the exemption cannot be used as a blanket bypass.
   */
  threeDsRequirement(key: string, request: NetworkAuthorisationRequest): ThreeDsRequirement {
    if (request.threeDsCompleted) return ThreeDsRequirement.ALREADY_SATISFIED;
    if (CARDHOLDER_PRESENT_CHANNELS.includes(request.channel)) {
      return ThreeDsRequirement.NOT_REQUIRED;
    }

    const exempt = request.amount.amount < LOW_VALUE_EXEMPTION_MINOR;
    if (!exempt) return ThreeDsRequirement.CHALLENGE;

    const sampled = seededChance(
      this.seed,
      `3ds:${key}`,
      THREE_DS_SAMPLING_BPS,
      BASIS_POINTS_TOTAL,
    );
    return sampled ? ThreeDsRequirement.CHALLENGE : ThreeDsRequirement.NOT_REQUIRED;
  }

  /**
   * How a challenge the cardholder was sent into actually ends.
   *
   * Abandonment is modelled as its own outcome rather than folded into failure, because
   * the two mean different things to a merchant: a customer who gave up may come back,
   * and one whose authentication failed is being told they are not the cardholder.
   */
  resolveChallenge(key: string): ThreeDsOutcome {
    if (seededChance(this.seed, `3ds-abandon:${key}`, CHALLENGE_ABANDON_BPS, BASIS_POINTS_TOTAL)) {
      return ThreeDsOutcome.ABANDONED;
    }

    if (seededChance(this.seed, `3ds-fail:${key}`, CHALLENGE_FAILURE_BPS, BASIS_POINTS_TOTAL)) {
      return ThreeDsOutcome.FAILED;
    }

    return ThreeDsOutcome.PASSED;
  }

  /** When an approval on this channel lapses if the merchant never claims it. */
  expiryFor(channel: CardChannel, at: Date): Date {
    return new Date(at.getTime() + AUTHORISATION_VALIDITY_HOURS[channel] * MILLISECONDS_PER_HOUR);
  }

  /** Simulated round-trip latency, within the configured band. */
  latencyFor(key: string): number {
    const span = Math.max(this.latencyMaxMs - this.latencyMinMs, 1);
    return this.latencyMinMs + seededInt(this.seed, `latency:${key}`, span);
  }

  private digits(key: string): string {
    return seededString(this.seed, key, NETWORK_REFERENCE_LENGTH, REFERENCE_ALPHABET);
  }
}

/**
 * Namespaces a draw so two decisions about the same payment cannot collide.
 *
 * Without it, the acquirer reference and the clearing reference for one authorisation
 * would be drawn from the same key and come out identical — two different scheme
 * identifiers with the same digits, which a reconciliation would read as one message.
 */
function scoped(domain: string, key: string): string {
  return `${domain}:${key}`;
}
