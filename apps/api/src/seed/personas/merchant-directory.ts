import { SpendCategory } from '@reliance/contracts';

/**
 * Merchants the generated customers spend at.
 *
 * The point of a directory rather than random strings is that a customer's history has to
 * *look* like a life. Uniform noise across random names produces a spend chart with no
 * shape — every category the same size, no recurring subscriptions, no weekly rhythm — and
 * a dashboard built against that data is never tested on the thing it exists to show.
 *
 * Amount ranges are minor units and deliberately narrow per merchant: a coffee is £2–£5,
 * never £2–£400. The categoriser derives the category from the MCC in production, so the
 * category here is only a cross-check that the two agree.
 */

export interface Merchant {
  readonly name: string;
  /** ISO 18245 merchant category code. */
  readonly mcc: string;
  readonly category: SpendCategory;
  /** Inclusive minor-unit range for a single purchase. */
  readonly minMinor: number;
  readonly maxMinor: number;
  /** Roughly how often this merchant appears, relative to the others. */
  readonly weight: number;
  readonly country: string;
}

/** A charge that repeats on a fixed cadence — what subscription detection has to find. */
export interface RecurringMerchant extends Merchant {
  readonly fixedMinor: number;
  readonly dayOfMonth: number;
}

const GROCERS: readonly Merchant[] = [
  m({
    name: 'Sainsburys',
    mcc: '5411',
    category: SpendCategory.GROCERIES,
    minMinor: 850,
    maxMinor: 8_400,
    weight: 9,
  }),
  m({
    name: 'Tesco Express',
    mcc: '5411',
    category: SpendCategory.GROCERIES,
    minMinor: 420,
    maxMinor: 3_200,
    weight: 11,
  }),
  m({
    name: 'Waitrose',
    mcc: '5411',
    category: SpendCategory.GROCERIES,
    minMinor: 1_600,
    maxMinor: 9_800,
    weight: 4,
  }),
  m({
    name: 'Lidl',
    mcc: '5411',
    category: SpendCategory.GROCERIES,
    minMinor: 900,
    maxMinor: 5_500,
    weight: 5,
  }),
  m({
    name: 'Co-op Food',
    mcc: '5411',
    category: SpendCategory.GROCERIES,
    minMinor: 300,
    maxMinor: 2_600,
    weight: 7,
  }),
];

const DINING: readonly Merchant[] = [
  m({
    name: 'Pret A Manger',
    mcc: '5814',
    category: SpendCategory.DINING,
    minMinor: 380,
    maxMinor: 1_250,
    weight: 12,
  }),
  m({
    name: 'Dishoom',
    mcc: '5812',
    category: SpendCategory.DINING,
    minMinor: 2_800,
    maxMinor: 9_600,
    weight: 2,
  }),
  m({
    name: 'Franco Manca',
    mcc: '5812',
    category: SpendCategory.DINING,
    minMinor: 1_400,
    maxMinor: 4_800,
    weight: 3,
  }),
  m({
    name: 'Greggs',
    mcc: '5814',
    category: SpendCategory.DINING,
    minMinor: 180,
    maxMinor: 890,
    weight: 8,
  }),
  m({
    name: 'Deliveroo',
    mcc: '5812',
    category: SpendCategory.DINING,
    minMinor: 1_200,
    maxMinor: 5_400,
    weight: 6,
  }),
  m({
    name: 'The Crown & Anchor',
    mcc: '5813',
    category: SpendCategory.DINING,
    minMinor: 850,
    maxMinor: 6_200,
    weight: 4,
  }),
];

const TRANSPORT: readonly Merchant[] = [
  m({
    name: 'Transport for London',
    mcc: '4111',
    category: SpendCategory.TRANSPORT,
    minMinor: 240,
    maxMinor: 1_580,
    weight: 14,
  }),
  m({
    name: 'Trainline',
    mcc: '4112',
    category: SpendCategory.TRANSPORT,
    minMinor: 1_100,
    maxMinor: 12_400,
    weight: 3,
  }),
  m({
    name: 'Uber',
    mcc: '4121',
    category: SpendCategory.TRANSPORT,
    minMinor: 620,
    maxMinor: 4_200,
    weight: 5,
  }),
  m({
    name: 'Shell',
    mcc: '5541',
    category: SpendCategory.FUEL,
    minMinor: 3_500,
    maxMinor: 9_200,
    weight: 3,
  }),
  m({
    name: 'BP Connect',
    mcc: '5541',
    category: SpendCategory.FUEL,
    minMinor: 3_000,
    maxMinor: 8_600,
    weight: 2,
  }),
];

const SHOPPING: readonly Merchant[] = [
  m({
    name: 'Amazon UK',
    mcc: '5942',
    category: SpendCategory.SHOPPING,
    minMinor: 599,
    maxMinor: 14_900,
    weight: 10,
  }),
  m({
    name: 'John Lewis',
    mcc: '5311',
    category: SpendCategory.SHOPPING,
    minMinor: 2_200,
    maxMinor: 24_000,
    weight: 2,
  }),
  m({
    name: 'Uniqlo',
    mcc: '5651',
    category: SpendCategory.SHOPPING,
    minMinor: 1_500,
    maxMinor: 8_900,
    weight: 2,
  }),
  m({
    name: 'Boots',
    mcc: '5912',
    category: SpendCategory.HEALTH,
    minMinor: 450,
    maxMinor: 4_200,
    weight: 4,
  }),
  m({
    name: 'Argos',
    mcc: '5732',
    category: SpendCategory.SHOPPING,
    minMinor: 1_200,
    maxMinor: 18_000,
    weight: 2,
  }),
];

const LEISURE: readonly Merchant[] = [
  m({
    name: 'Odeon Cinemas',
    mcc: '7832',
    category: SpendCategory.ENTERTAINMENT,
    minMinor: 990,
    maxMinor: 3_400,
    weight: 2,
  }),
  m({
    name: 'Waterstones',
    mcc: '5942',
    category: SpendCategory.ENTERTAINMENT,
    minMinor: 799,
    maxMinor: 3_600,
    weight: 2,
  }),
  m({
    name: 'PureGym',
    mcc: '7997',
    category: SpendCategory.HEALTH,
    minMinor: 2_499,
    maxMinor: 2_499,
    weight: 1,
  }),
  m({
    name: 'Booking.com',
    mcc: '7011',
    category: SpendCategory.TRAVEL,
    minMinor: 8_000,
    maxMinor: 62_000,
    weight: 1,
  }),
  m({
    name: 'easyJet',
    mcc: '3000',
    category: SpendCategory.TRAVEL,
    minMinor: 4_200,
    maxMinor: 34_000,
    weight: 1,
  }),
];

/** Every one-off merchant, weighted. */
export const MERCHANTS: readonly Merchant[] = Object.freeze([
  ...GROCERS,
  ...DINING,
  ...TRANSPORT,
  ...SHOPPING,
  ...LEISURE,
]);

/**
 * Fixed monthly charges.
 *
 * Same merchant, same amount, same day each month — the signal the subscription detector
 * looks for. Without these in the data the detector has nothing to find and its tests
 * prove only that it does not crash.
 */
export const SUBSCRIPTIONS: readonly RecurringMerchant[] = Object.freeze([
  recurring({
    name: 'Netflix',
    mcc: '4899',
    category: SpendCategory.SUBSCRIPTIONS,
    fixedMinor: 1_099,
    dayOfMonth: 3,
  }),
  recurring({
    name: 'Spotify',
    mcc: '5815',
    category: SpendCategory.SUBSCRIPTIONS,
    fixedMinor: 1_199,
    dayOfMonth: 7,
  }),
  recurring({
    name: 'PureGym',
    mcc: '7997',
    category: SpendCategory.HEALTH,
    fixedMinor: 2_499,
    dayOfMonth: 1,
  }),
  recurring({
    name: 'Vodafone UK',
    mcc: '4814',
    category: SpendCategory.UTILITIES,
    fixedMinor: 2_800,
    dayOfMonth: 12,
  }),
  recurring({
    name: 'Thames Water',
    mcc: '4900',
    category: SpendCategory.UTILITIES,
    fixedMinor: 3_450,
    dayOfMonth: 15,
  }),
  recurring({
    name: 'British Gas',
    mcc: '4900',
    category: SpendCategory.UTILITIES,
    fixedMinor: 7_200,
    dayOfMonth: 18,
  }),
  recurring({
    name: 'Aviva Home Insurance',
    mcc: '6300',
    category: SpendCategory.INSURANCE,
    fixedMinor: 1_850,
    dayOfMonth: 22,
  }),
]);

function m(input: Omit<Merchant, 'country'>): Merchant {
  return Object.freeze({ ...input, country: 'GB' });
}

function recurring(
  input: Pick<RecurringMerchant, 'name' | 'mcc' | 'category' | 'fixedMinor' | 'dayOfMonth'>,
): RecurringMerchant {
  return Object.freeze({
    ...input,
    minMinor: input.fixedMinor,
    maxMinor: input.fixedMinor,
    weight: 1,
    country: 'GB',
  });
}

/**
 * The subscription names, as a typed lookup.
 *
 * Personas reference subscriptions by name. Bare strings there meant a typo produced a
 * customer who silently had one fewer recurring charge than intended — the generator
 * would not complain, and the missing signal would only show up as a subscription
 * detector that found nothing. This makes the reference checkable at compile time.
 */
export const SUBSCRIPTION = {
  NETFLIX: 'Netflix',
  SPOTIFY: 'Spotify',
  GYM: 'PureGym',
  MOBILE: 'Vodafone UK',
  WATER: 'Thames Water',
  GAS: 'British Gas',
  HOME_INSURANCE: 'Aviva Home Insurance',
} as const;

export type SubscriptionName = (typeof SUBSCRIPTION)[keyof typeof SUBSCRIPTION];
