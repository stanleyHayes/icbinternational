/**
 * The tier read the rest of the bank consumes.
 *
 * Two records hold a view of the tier: the case (who approved what, until when) and the
 * customer record (what the limits read path consults). They can only drift when an
 * expiry lands between decisions, so this service reconciles on read: a lapsed approval
 * is retired and the customer record dropped to 0 before the answer is given. Every
 * read is fresh — a tier is looked up, never cached — which is what makes an upgrade
 * lift the customer's limits the moment the decision lands.
 */

import { Injectable } from '@nestjs/common';

import { KycStatus, KycTier, type KycTier as KycTierType } from '@reliance/contracts';

import { UserRepository } from '../auth/users/index.js';

import { KycCaseRepository } from './kyc-case.repository.js';
import { KycExpiryService } from './kyc-expiry.service.js';
import { KycTierPort } from './kyc-tier.port.js';

/** The tiers a stored number may narrow to. */
const VALID_TIERS: readonly number[] = Object.freeze([
  KycTier.TIER_0,
  KycTier.TIER_1,
  KycTier.TIER_2,
  KycTier.TIER_3,
]);

@Injectable()
export class KycTierService extends KycTierPort {
  constructor(
    private readonly cases: KycCaseRepository,
    private readonly users: UserRepository,
    private readonly expiry: KycExpiryService,
  ) {
    super();
  }

  /** The customer's current verified tier, expiry applied on the way. See the port. */
  async tierOf(userId: string): Promise<KycTierType> {
    const kycCase = await this.cases.findByUser(userId);
    if (kycCase && (await this.expiry.expireIfDue(kycCase))) return KycTier.TIER_0;

    if (kycCase?.status === KycStatus.APPROVED) return asTier(kycCase.currentTier);

    const user = await this.users.findById(userId);
    return asTier(user?.kycTier ?? KycTier.TIER_0);
  }
}

/** Narrows a stored number to the contract's tier type. Unknown values read as tier 0. */
function asTier(value: number): KycTierType {
  return VALID_TIERS.includes(value) ? (value as KycTierType) : KycTier.TIER_0;
}
