import { SpendCategory } from '@reliance/contracts';

/**
 * ISO 18245 merchant category codes, mapped to the categories a customer recognises.
 *
 * Two layers, consulted in order. Exact codes come first because the ranges below them
 * are broad and would otherwise swallow the specific cases that matter most — 5814 is
 * inside the 5800s and means "fast food", 5541 is inside the 5500s and means "fuel", and
 * a customer who sees petrol filed under "Shopping" stops trusting the whole screen.
 *
 * The ranges are the published ISO groupings, not invented ones, so a code the bank has
 * never seen before still lands somewhere defensible instead of in "Uncategorised".
 */

/** Codes whose meaning is too specific to leave to a range. */
export const MCC_EXACT: ReadonlyMap<string, SpendCategory> = new Map([
  // Food
  ['5411', SpendCategory.GROCERIES],
  ['5422', SpendCategory.GROCERIES],
  ['5441', SpendCategory.GROCERIES],
  ['5451', SpendCategory.GROCERIES],
  ['5462', SpendCategory.GROCERIES],
  ['5499', SpendCategory.GROCERIES],
  ['5812', SpendCategory.DINING],
  ['5813', SpendCategory.DINING],
  ['5814', SpendCategory.DINING],

  // Fuel and motoring
  ['5541', SpendCategory.FUEL],
  ['5542', SpendCategory.FUEL],
  ['5983', SpendCategory.FUEL],
  ['7523', SpendCategory.TRANSPORT],

  // Recurring services
  ['4899', SpendCategory.SUBSCRIPTIONS],
  ['5815', SpendCategory.SUBSCRIPTIONS],
  ['5816', SpendCategory.SUBSCRIPTIONS],
  ['5817', SpendCategory.SUBSCRIPTIONS],
  ['5818', SpendCategory.SUBSCRIPTIONS],
  ['5968', SpendCategory.SUBSCRIPTIONS],

  // Household bills
  ['4812', SpendCategory.UTILITIES],
  ['4814', SpendCategory.UTILITIES],
  ['4816', SpendCategory.UTILITIES],
  ['4821', SpendCategory.UTILITIES],
  ['4900', SpendCategory.UTILITIES],
  ['6513', SpendCategory.RENT_MORTGAGE],

  // Money and financial services
  ['6010', SpendCategory.CASH],
  ['6011', SpendCategory.CASH],
  ['6051', SpendCategory.CASH],
  ['6012', SpendCategory.TRANSFERS],
  ['6540', SpendCategory.TRANSFERS],
  ['6211', SpendCategory.SAVINGS],
  ['6300', SpendCategory.INSURANCE],
  ['6381', SpendCategory.INSURANCE],
  ['6399', SpendCategory.INSURANCE],

  // Health and travel outliers that sit outside their obvious range
  ['5912', SpendCategory.HEALTH],
  ['5122', SpendCategory.HEALTH],
  ['4511', SpendCategory.TRAVEL],
  ['4722', SpendCategory.TRAVEL],
  ['7011', SpendCategory.TRAVEL],
  ['7512', SpendCategory.TRAVEL],
]);

/** An inclusive code range and the category it resolves to. */
export interface MccRange {
  readonly from: number;
  readonly to: number;
  readonly category: SpendCategory;
}

/**
 * The published ISO groupings, narrowest first.
 *
 * Order is significant: the first range that contains the code wins, so a narrow band
 * must precede any wider one it sits inside. Adding a range in the wrong position is the
 * one way to break this table, which is why they are listed in ascending width.
 */
export const MCC_RANGES: readonly MccRange[] = [
  { from: 3000, to: 3299, category: SpendCategory.TRAVEL },
  { from: 3300, to: 3499, category: SpendCategory.TRAVEL },
  { from: 3500, to: 3999, category: SpendCategory.TRAVEL },
  { from: 4000, to: 4199, category: SpendCategory.TRANSPORT },
  { from: 4200, to: 4299, category: SpendCategory.TRANSPORT },
  { from: 4400, to: 4599, category: SpendCategory.TRAVEL },
  { from: 4700, to: 4799, category: SpendCategory.TRANSPORT },
  { from: 5300, to: 5399, category: SpendCategory.GROCERIES },
  { from: 5400, to: 5499, category: SpendCategory.GROCERIES },
  { from: 5500, to: 5599, category: SpendCategory.TRANSPORT },
  { from: 5600, to: 5699, category: SpendCategory.SHOPPING },
  { from: 5700, to: 5799, category: SpendCategory.SHOPPING },
  { from: 5800, to: 5899, category: SpendCategory.DINING },
  { from: 5900, to: 5999, category: SpendCategory.SHOPPING },
  { from: 5200, to: 5299, category: SpendCategory.SHOPPING },
  { from: 5000, to: 5199, category: SpendCategory.SHOPPING },
  { from: 6000, to: 6999, category: SpendCategory.TRANSFERS },
  { from: 7000, to: 7299, category: SpendCategory.TRAVEL },
  { from: 7300, to: 7399, category: SpendCategory.SHOPPING },
  { from: 7500, to: 7599, category: SpendCategory.TRANSPORT },
  { from: 7800, to: 7999, category: SpendCategory.ENTERTAINMENT },
  { from: 8000, to: 8099, category: SpendCategory.HEALTH },
  { from: 8200, to: 8299, category: SpendCategory.EDUCATION },
  { from: 8300, to: 8399, category: SpendCategory.HEALTH },
  { from: 8600, to: 8699, category: SpendCategory.ENTERTAINMENT },
  { from: 8900, to: 8999, category: SpendCategory.HEALTH },
  { from: 9200, to: 9399, category: SpendCategory.FEES },
  { from: 9400, to: 9499, category: SpendCategory.FEES },
];
