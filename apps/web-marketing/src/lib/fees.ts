import type { FeeScheduleEntry, ProductFees } from '@reliance/contracts';

/**
 * Flattening the fee schedule into the rows a fee table prints.
 *
 * `/public/fees` groups charges under the product that levies them, because the regulator
 * expects the schedule to be one document rather than five product pages stapled together.
 * The tables render a flat list, and the same charge — a replacement card, an overseas
 * withdrawal — is levied at the same price by several products, so the flattening has to
 * de-duplicate or the page prints the same line four times.
 *
 * Keyed on `kind` and first-wins: the catalogue is seeded from one fee definition per kind,
 * so the first occurrence is the charge. If two products ever genuinely price the same kind
 * differently, this hides one of them — at which point the table needs a product column and
 * this helper should go, rather than be taught to pick a winner.
 */
export function feeEntries(grouped: readonly ProductFees[]): readonly FeeScheduleEntry[] {
  const byKind = new Map<string, FeeScheduleEntry>();

  for (const product of grouped) {
    for (const fee of product.fees) {
      if (!byKind.has(fee.kind)) byKind.set(fee.kind, fee);
    }
  }

  return [...byKind.values()];
}
