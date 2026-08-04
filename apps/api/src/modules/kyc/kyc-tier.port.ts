/**
 * The question every money-moving lane asks KYC: "what tier is this customer, right
 * now?" — and nothing else.
 *
 * An abstract class so Nest resolves it as type and injection token at once. The limits
 * engine's callers bind against this port rather than the concrete service, which keeps
 * "how a tier is known" free to change (today: the user record, self-healed from the
 * case; tomorrow: a screening-adjusted view) without a consumer noticing.
 */

import { type KycTier } from '@reliance/contracts';

/** Read-only tier lookup. Fresh on every call — a tier is never snapshotted. */
export abstract class KycTierPort {
  /**
   * The customer's current verified tier.
   *
   * Expiry-aware: an approval whose re-KYC validity has lapsed answers tier 0 and is
   * retired on the way past, so a stale approval cannot keep lifting limits. Tier 0 is
   * also the answer for a customer who has never completed onboarding.
   */
  abstract tierOf(userId: string): Promise<KycTier>;
}
