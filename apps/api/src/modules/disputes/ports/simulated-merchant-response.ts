import { Injectable } from '@nestjs/common';

import { DisputeReason } from '@reliance/contracts';

import { seededInt, seededPick } from '../../../rails/card-network/index.js';
import { MERCHANT_CONTEST_RATE_PERCENT } from '../disputes.constants.js';

import {
  type MerchantResponse,
  MerchantResponsePort,
  type MerchantResponseQuery,
} from './merchant-response.port.js';

const PERCENT = 100;

const CONTEST_LINES: readonly string[] = [
  'Cardholder participated in the transaction; signed receipt and CVV2 match supplied.',
  'Goods were dispatched to the verified address and tracking shows delivery.',
  'Service was rendered in full on the booked dates; usage logs supplied.',
  'Recurring charge was not cancelled within the terms agreed at signup.',
];

const ACCEPT_LINES: readonly string[] = [
  'Merchant accepts liability and will not contest the chargeback.',
  'Merchant could not locate fulfilment records; chargeback accepted.',
];

/**
 * The simulated merchant, answering through the simulated scheme.
 *
 * Deterministic per dispute — the same case always gets the same answer, so a scenario
 * replays identically for the engineer investigating it. A reason a merchant can rarely
 * win (cash not dispensed, duplicate charge) contests less often than one they usually
 * fight, which keeps the portfolio of outcomes realistic rather than uniform.
 */
@Injectable()
export class SimulatedMerchantResponse extends MerchantResponsePort {
  respond(input: MerchantResponseQuery): MerchantResponse {
    const contests = this.contestsLiability(input);
    const line = seededPick(
      input.disputeId,
      contests ? 'merchant-contest-line' : 'merchant-accept-line',
      contests ? CONTEST_LINES : ACCEPT_LINES,
    );

    return {
      contestsLiability: contests,
      responseText: `${input.merchantName}: ${line}`,
    };
  }

  private contestsLiability(input: MerchantResponseQuery): boolean {
    const weighted = (MERCHANT_CONTEST_RATE_PERCENT * contestWeightBpsFor(input.reason)) / BPS;
    const rate = Math.round(weighted);
    return seededInt(input.disputeId, 'merchant-contests', PERCENT) < rate;
  }
}

/**
 * How a reason shifts the contest rate. A dispute the merchant almost never wins is
 * accepted more readily; a subjective one is fought harder. Clamped so even the hardest
 * case sometimes accepts and the easiest sometimes fights.
 */
function contestWeightBpsFor(reason: DisputeReason): number {
  switch (reason) {
    case DisputeReason.DUPLICATE_CHARGE:
    case DisputeReason.ATM_CASH_NOT_DISPENSED:
      return EASY_WIN_WEIGHT;
    case DisputeReason.GOODS_NOT_AS_DESCRIBED:
    case DisputeReason.SUBSCRIPTION_CANCELLED:
    case DisputeReason.OTHER:
      return HARD_WIN_WEIGHT;
    default:
      return NEUTRAL_WEIGHT;
  }
}

/**
 * Weights in basis points, matching how every other ratio in this codebase is carried.
 * A float literal here would be the only one in the money path, and the ban on those is
 * worth more than the two characters it saves.
 */
const BPS = 10_000;
const EASY_WIN_WEIGHT = 5_000;
const NEUTRAL_WEIGHT = 10_000;
const HARD_WIN_WEIGHT = 12_500;
