import { type DisputeReason } from '@reliance/contracts';

/**
 * What the merchant — via the card scheme — answers to a chargeback.
 *
 * A port rather than a direct call into `rails/card-network`: the scheme lifecycle is
 * simulated in-house, and the day a real scheme connector exists, the dispute flow
 * should notice a provider swap, not a refactor. Tests bind their own adapter to choose
 * which way a case goes.
 */
export abstract class MerchantResponsePort {
  /** The merchant's answer to one dispute. Deterministic per dispute. */
  abstract respond(input: MerchantResponseQuery): MerchantResponse;
}

/** What the merchant knows about the case when they answer. */
export interface MerchantResponseQuery {
  readonly disputeId: string;
  readonly reason: DisputeReason;
  readonly merchantName: string;
  readonly amountFormatted: string;
}

/** The merchant's answer. */
export interface MerchantResponse {
  /**
   * True when the merchant fights the chargeback with their own evidence — the case
   * moves to `REPRESENTED`. False means they accept liability and the dispute is won.
   */
  readonly contestsLiability: boolean;
  /** The merchant's statement, shown to staff and summarised to the customer. */
  readonly responseText: string;
}
