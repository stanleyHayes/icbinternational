import { Injectable } from '@nestjs/common';

/**
 * Where the customer's pricing tier comes from.
 *
 * Product fee schedules waive by tier (`waivedForTiers`), but nothing in the platform
 * yet resolves which pricing tier a customer is on — the seed catalogue defines the
 * vocabulary (`STUDENT`, `PREMIER`, `BUSINESS_PLUS`) and no record carries it. That is
 * a gap in another lane's ownership, so it sits behind this port: the fees engine asks
 * the port, and whichever lane ends up owning customer tiering re-binds it without
 * touching a line here.
 */
export abstract class CustomerTierPort {
  /** The customer's pricing tier for fee waivers, or null when on standard terms. */
  abstract tierFor(accountId: string): Promise<string | null>;
}

/**
 * The default binding: every account is on standard terms.
 *
 * Honest rather than helpful — it waives nothing, so no customer is silently given a
 * waiver the bank never granted, and no fee is silently invented either.
 */
@Injectable()
export class StandardTermsTierPort extends CustomerTierPort {
  override async tierFor(): Promise<string | null> {
    return null;
  }
}
