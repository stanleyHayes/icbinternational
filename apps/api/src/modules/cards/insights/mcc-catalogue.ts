/**
 * Merchant category codes, in language a customer recognises.
 *
 * ISO 18245 assigns four digits to every kind of business a card can pay. "5411" is
 * precise and means nothing to anybody; "Groceries" is what belongs on a spending
 * breakdown. This table is the translation, and it is a table rather than a lookup
 * service because it changes about once a year and belongs in review alongside the code
 * that reads it.
 *
 * Codes absent from the table are not an error. A card can be presented at any merchant
 * in the world, and an unrecognised category is reported honestly as "Other" rather than
 * dropped from the breakdown — a total that does not add up to what left the account is
 * worse than a category nobody has named yet.
 */

/** What an unrecognised merchant category is shown as. */
export const UNCATEGORISED_LABEL = 'Other';

/** One category, as a customer sees it. */
export interface MccCategory {
  readonly code: string;
  readonly label: string;
  /** Whether spending here is typically recurring — rent, insurance, streaming. */
  readonly commonlyRecurring: boolean;
}

const CATEGORIES: readonly MccCategory[] = Object.freeze([
  category('5411', 'Groceries'),
  category('5499', 'Convenience stores'),
  category('5812', 'Restaurants'),
  category('5814', 'Fast food'),
  category('5813', 'Bars and pubs'),
  category('5541', 'Fuel'),
  category('5542', 'Fuel'),
  category('4111', 'Public transport'),
  category('4121', 'Taxis and rideshare'),
  category('4511', 'Airlines'),
  category('7011', 'Hotels'),
  category('5912', 'Pharmacy'),
  category('8062', 'Healthcare'),
  category('5651', 'Clothing'),
  category('5732', 'Electronics'),
  category('5999', 'General retail'),
  category('5691', 'Clothing'),
  category('7832', 'Cinema and entertainment'),
  category('7997', 'Gyms and clubs', true),
  category('4899', 'Streaming and cable', true),
  category('5968', 'Subscriptions', true),
  category('4814', 'Mobile and telecoms', true),
  category('4900', 'Utilities', true),
  category('6300', 'Insurance', true),
  category('8220', 'Education', true),
  category('6513', 'Rent', true),
  category('7995', 'Gambling'),
  category('6051', 'Cash and currency'),
  category('6011', 'Cash withdrawals'),
  category('8398', 'Charity'),
]);

const BY_CODE = new Map(CATEGORIES.map((entry) => [entry.code, entry]));

/** The category for a code, or `Other` when the code is one we have not named. */
export function categoryFor(mcc: string): MccCategory {
  return BY_CODE.get(mcc) ?? { code: mcc, label: UNCATEGORISED_LABEL, commonlyRecurring: false };
}

/** The customer-facing label for a merchant category code. */
export function labelFor(mcc: string): string {
  return categoryFor(mcc).label;
}

/** Whether merchants in this category usually bill on a schedule. */
export function isCommonlyRecurring(mcc: string): boolean {
  return categoryFor(mcc).commonlyRecurring;
}

/** Every category the catalogue names. */
export function allCategories(): readonly MccCategory[] {
  return CATEGORIES;
}

function category(code: string, label: string, commonlyRecurring = false): MccCategory {
  return Object.freeze({ code, label, commonlyRecurring });
}
