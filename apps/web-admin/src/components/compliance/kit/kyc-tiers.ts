/**
 * The verification ladder.
 *
 * Tier 0 can receive money and nothing else; tier 3 is a fully verified customer with no
 * cap. The number lives here rather than being written as a literal in each filter and
 * each decision form, because adding a tier must not mean hunting for every `3` in the
 * console.
 */

/** Highest verification tier the bank grants. */
export const MAX_KYC_TIER = 3;

/** Every tier, as options for a filter or a decision form. */
export const KYC_TIER_OPTIONS = Array.from({ length: MAX_KYC_TIER + 1 }, (_unused, tier) => ({
  value: String(tier),
  label: `Tier ${tier}`,
}));
