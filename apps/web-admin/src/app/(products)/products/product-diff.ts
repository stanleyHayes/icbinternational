/**
 * What a repricing would actually change.
 *
 * Publishing a product version is the single most consequential thing this console does
 * to people who are not in the room: a fee that moves by fifty pence moves it for every
 * account opened afterwards, and nobody in the building will notice for a month. So the
 * change is computed field by field and shown before it is published, in the same words
 * the editor used.
 *
 * Comparison is over minor-unit strings and integer basis points, never over formatted
 * text, so "£1.00" and "£1.0" cannot register as a change and 100 and 100 cannot register
 * as one either.
 */

import type { FeeScheduleEntry, InterestTier, LimitMatrix, Product } from '@reliance/contracts';

/** One field that differs between the live version and the draft. */
export interface ProductChange {
  /** What changed, as an operator would say it. */
  readonly label: string;
  readonly before: string;
  readonly after: string;
}

const NOT_SET = 'Not set';

function money(value: { readonly amount: string } | null | undefined): string {
  return value ? value.amount : NOT_SET;
}

function bps(value: number | null | undefined): string {
  return value === null || value === undefined ? NOT_SET : `${String(value)} bps`;
}

function push(changes: ProductChange[], label: string, before: string, after: string): void {
  if (before !== after) changes.push({ label, before, after });
}

function feeKey(fee: FeeScheduleEntry): string {
  return `${fee.kind}:${money(fee.flatAmount)}:${bps(fee.rateBps)}:${String(fee.freeAllowancePerMonth)}`;
}

function tierKey(tier: InterestTier): string {
  return `${tier.fromAmount.amount}-${tier.toAmount?.amount ?? 'above'}@${String(tier.annualRateBps)}`;
}

function limitKey(limit: LimitMatrix): string {
  return [
    money(limit.perTransaction),
    money(limit.daily),
    money(limit.monthly),
    limit.dailyCount === null ? NOT_SET : String(limit.dailyCount),
  ].join('/');
}

function compareFees(live: Product, draft: Product, changes: ProductChange[]): void {
  for (const fee of draft.fees) {
    const previous = live.fees.find((candidate) => candidate.kind === fee.kind);
    push(changes, fee.label, previous ? feeKey(previous) : NOT_SET, feeKey(fee));
  }
}

function compareTiers(live: Product, draft: Product, changes: ProductChange[]): void {
  const before = live.creditInterestTiers.map(tierKey).join(', ');
  const after = draft.creditInterestTiers.map(tierKey).join(', ');
  push(changes, 'Credit interest tiers', before || NOT_SET, after || NOT_SET);
}

function compareLimits(live: Product, draft: Product, changes: ProductChange[]): void {
  for (const scope of Object.keys(draft.limits) as (keyof Product['limits'])[]) {
    push(changes, `${scope} limits`, limitKey(live.limits[scope]), limitKey(draft.limits[scope]));
  }
}

/** Every field that differs between the live version and the draft. */
export function productChanges(live: Product, draft: Product): readonly ProductChange[] {
  const changes: ProductChange[] = [];

  push(changes, 'Name', live.name, draft.name);
  push(changes, 'Tagline', live.tagline, draft.tagline);
  push(changes, 'Description', live.description, draft.description);
  push(changes, 'Monthly fee', money(live.monthlyFee), money(draft.monthlyFee));
  push(
    changes,
    'Minimum opening balance',
    money(live.minOpeningBalance),
    money(draft.minOpeningBalance),
  );
  push(changes, 'Minimum balance', money(live.minBalance), money(draft.minBalance));
  push(changes, 'Overdraft interest', bps(live.debitInterestBps), bps(draft.debitInterestBps));
  push(changes, 'Minimum identity tier', String(live.minKycTier), String(draft.minKycTier));
  push(changes, 'Available to new customers', String(live.active), String(draft.active));
  push(changes, 'Effective from', live.effectiveFrom, draft.effectiveFrom);

  compareFees(live, draft, changes);
  compareTiers(live, draft, changes);
  compareLimits(live, draft, changes);

  return changes;
}
