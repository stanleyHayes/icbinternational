import { BillerCategory, type Biller } from '@reliance/contracts';

import { SEED_CURRENCY } from '../../seed.constants.js';

/**
 * The billers reachable through the simulated bill-payment rail.
 *
 * A real directory is what makes the payments screen believable: a customer paying
 * "Thames Water" with an eight-to-ten digit account number recognises their own life,
 * where "Test Biller 3" tells them nothing. The account-number patterns are the shapes
 * the real organisations use, because a validation rule that never rejects anything is
 * not a validation rule.
 */

/** Reference formats, named because the same shape recurs across a dozen billers. */
const Pattern = {
  DIGITS_8: '^\\d{8}$',
  DIGITS_9: '^\\d{9}$',
  DIGITS_10: '^\\d{10}$',
  DIGITS_12: '^\\d{12}$',
  DIGITS_8_TO_12: '^\\d{8,12}$',
  UK_MOBILE: '^07\\d{9}$',
  ALPHANUMERIC_8_TO_14: '^[A-Z0-9]{8,14}$',
  POLICY_NUMBER: '^[A-Z]{2,4}\\d{6,10}$',
  VEHICLE_REGISTRATION: '^[A-Z]{2}\\d{2}\\s?[A-Z]{3}$',
} as const;

/** What the customer is asked to type. Wording matters more than it looks. */
const Label = {
  ACCOUNT_NUMBER: 'Account number',
  CUSTOMER_REFERENCE: 'Customer reference',
  POLICY_NUMBER: 'Policy number',
  MOBILE_NUMBER: 'Mobile number',
  LICENCE_NUMBER: 'Licence number',
  SUPPORTER_ID: 'Supporter ID',
  REGISTRATION: 'Vehicle registration',
} as const;

interface BillerRow {
  id: string;
  name: string;
  category: BillerCategory;
  label: string;
  pattern: string;
  /** Minor units. Defaults to £1.00 minimum and £5,000.00 maximum. */
  min?: string;
  max?: string;
  /** Charge the bank makes for the payment. Defaults to free. */
  fee?: string;
  /** Whether the rail can confirm the payee's name before the debit. */
  validated?: boolean;
}

const DEFAULT_MINIMUM = '100';
const DEFAULT_MAXIMUM = '500000';
const NO_FEE = '0';

function biller(row: BillerRow): Biller {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    logoUrl: null,
    accountNumberPattern: row.pattern,
    accountNumberLabel: row.label,
    minAmount: { amount: row.min ?? DEFAULT_MINIMUM, currency: SEED_CURRENCY },
    maxAmount: { amount: row.max ?? DEFAULT_MAXIMUM, currency: SEED_CURRENCY },
    fee: { amount: row.fee ?? NO_FEE, currency: SEED_CURRENCY },
    supportsValidation: row.validated ?? true,
    active: true,
  } as Biller;
}

/** Every biller the demo bank can pay. Ordered by category, then by name. */
export const BILLER_DIRECTORY: readonly Biller[] = Object.freeze([
  biller({
    id: 'octopus-energy',
    name: 'Octopus Energy',
    category: BillerCategory.ELECTRICITY,
    label: Label.ACCOUNT_NUMBER,
    pattern: Pattern.DIGITS_9,
  }),
  biller({
    id: 'edf-energy',
    name: 'EDF Energy',
    category: BillerCategory.ELECTRICITY,
    label: Label.ACCOUNT_NUMBER,
    pattern: Pattern.DIGITS_10,
  }),
  biller({
    id: 'scottish-power',
    name: 'ScottishPower',
    category: BillerCategory.ELECTRICITY,
    label: Label.ACCOUNT_NUMBER,
    pattern: Pattern.DIGITS_12,
  }),

  biller({
    id: 'british-gas',
    name: 'British Gas',
    category: BillerCategory.GAS,
    label: Label.ACCOUNT_NUMBER,
    pattern: Pattern.DIGITS_10,
  }),
  biller({
    id: 'eon-next',
    name: 'E.ON Next',
    category: BillerCategory.GAS,
    label: Label.ACCOUNT_NUMBER,
    pattern: Pattern.DIGITS_9,
  }),

  biller({
    id: 'thames-water',
    name: 'Thames Water',
    category: BillerCategory.WATER,
    label: Label.CUSTOMER_REFERENCE,
    pattern: Pattern.DIGITS_10,
  }),
  biller({
    id: 'severn-trent',
    name: 'Severn Trent Water',
    category: BillerCategory.WATER,
    label: Label.CUSTOMER_REFERENCE,
    pattern: Pattern.DIGITS_10,
  }),
  biller({
    id: 'anglian-water',
    name: 'Anglian Water',
    category: BillerCategory.WATER,
    label: Label.CUSTOMER_REFERENCE,
    pattern: Pattern.DIGITS_9,
  }),

  biller({
    id: 'bt-broadband',
    name: 'BT Broadband',
    category: BillerCategory.INTERNET,
    label: Label.ACCOUNT_NUMBER,
    pattern: Pattern.ALPHANUMERIC_8_TO_14,
  }),
  biller({
    id: 'virgin-media',
    name: 'Virgin Media',
    category: BillerCategory.INTERNET,
    label: Label.ACCOUNT_NUMBER,
    pattern: Pattern.DIGITS_12,
  }),
  biller({
    id: 'sky-broadband',
    name: 'Sky Broadband',
    category: BillerCategory.INTERNET,
    label: Label.ACCOUNT_NUMBER,
    pattern: Pattern.DIGITS_10,
  }),

  biller({
    id: 'ee-mobile',
    name: 'EE',
    category: BillerCategory.MOBILE,
    label: Label.MOBILE_NUMBER,
    pattern: Pattern.UK_MOBILE,
    max: '30000',
  }),
  biller({
    id: 'o2-mobile',
    name: 'O2',
    category: BillerCategory.MOBILE,
    label: Label.MOBILE_NUMBER,
    pattern: Pattern.UK_MOBILE,
    max: '30000',
  }),
  biller({
    id: 'vodafone-mobile',
    name: 'Vodafone',
    category: BillerCategory.MOBILE,
    label: Label.MOBILE_NUMBER,
    pattern: Pattern.UK_MOBILE,
    max: '30000',
  }),
  biller({
    id: 'three-mobile',
    name: 'Three',
    category: BillerCategory.MOBILE,
    label: Label.MOBILE_NUMBER,
    pattern: Pattern.UK_MOBILE,
    max: '30000',
  }),

  biller({
    id: 'sky-tv',
    name: 'Sky TV',
    category: BillerCategory.TV,
    label: Label.ACCOUNT_NUMBER,
    pattern: Pattern.DIGITS_10,
  }),
  biller({
    id: 'tv-licensing',
    name: 'TV Licensing',
    category: BillerCategory.TV,
    label: Label.LICENCE_NUMBER,
    pattern: Pattern.ALPHANUMERIC_8_TO_14,
    max: '20000',
  }),

  biller({
    id: 'aviva-insurance',
    name: 'Aviva',
    category: BillerCategory.INSURANCE,
    label: Label.POLICY_NUMBER,
    pattern: Pattern.POLICY_NUMBER,
    max: '1000000',
  }),
  biller({
    id: 'direct-line',
    name: 'Direct Line',
    category: BillerCategory.INSURANCE,
    label: Label.POLICY_NUMBER,
    pattern: Pattern.POLICY_NUMBER,
    max: '1000000',
  }),
  biller({
    id: 'admiral-insurance',
    name: 'Admiral',
    category: BillerCategory.INSURANCE,
    label: Label.POLICY_NUMBER,
    pattern: Pattern.POLICY_NUMBER,
    max: '1000000',
  }),

  biller({
    id: 'birmingham-council',
    name: 'Birmingham City Council',
    category: BillerCategory.COUNCIL_TAX,
    label: Label.ACCOUNT_NUMBER,
    pattern: Pattern.DIGITS_8,
    max: '600000',
  }),
  biller({
    id: 'manchester-council',
    name: 'Manchester City Council',
    category: BillerCategory.COUNCIL_TAX,
    label: Label.ACCOUNT_NUMBER,
    pattern: Pattern.DIGITS_8,
    max: '600000',
  }),
  biller({
    id: 'leeds-council',
    name: 'Leeds City Council',
    category: BillerCategory.COUNCIL_TAX,
    label: Label.ACCOUNT_NUMBER,
    pattern: Pattern.DIGITS_8,
    max: '600000',
  }),
  biller({
    id: 'glasgow-council',
    name: 'Glasgow City Council',
    category: BillerCategory.COUNCIL_TAX,
    label: Label.ACCOUNT_NUMBER,
    pattern: Pattern.DIGITS_8,
    max: '600000',
  }),

  biller({
    id: 'student-loans-company',
    name: 'Student Loans Company',
    category: BillerCategory.EDUCATION,
    label: Label.CUSTOMER_REFERENCE,
    pattern: Pattern.DIGITS_8_TO_12,
    max: '2000000',
  }),
  biller({
    id: 'university-of-manchester',
    name: 'University of Manchester',
    category: BillerCategory.EDUCATION,
    label: Label.CUSTOMER_REFERENCE,
    pattern: Pattern.DIGITS_8,
    max: '3000000',
  }),
  biller({
    id: 'ucas',
    name: 'UCAS',
    category: BillerCategory.EDUCATION,
    label: Label.CUSTOMER_REFERENCE,
    pattern: Pattern.DIGITS_10,
    max: '10000',
    validated: false,
  }),

  biller({
    id: 'cancer-research-uk',
    name: 'Cancer Research UK',
    category: BillerCategory.CHARITY,
    label: Label.SUPPORTER_ID,
    pattern: Pattern.DIGITS_8,
    validated: false,
  }),
  biller({
    id: 'british-red-cross',
    name: 'British Red Cross',
    category: BillerCategory.CHARITY,
    label: Label.SUPPORTER_ID,
    pattern: Pattern.DIGITS_8,
    validated: false,
  }),
  biller({
    id: 'shelter',
    name: 'Shelter',
    category: BillerCategory.CHARITY,
    label: Label.SUPPORTER_ID,
    pattern: Pattern.DIGITS_8,
    validated: false,
  }),
  biller({
    id: 'macmillan-support',
    name: 'Macmillan Cancer Support',
    category: BillerCategory.CHARITY,
    label: Label.SUPPORTER_ID,
    pattern: Pattern.DIGITS_8,
    validated: false,
  }),

  biller({
    id: 'dvla-vehicle-tax',
    name: 'DVLA Vehicle Tax',
    category: BillerCategory.OTHER,
    label: Label.REGISTRATION,
    pattern: Pattern.VEHICLE_REGISTRATION,
    max: '80000',
  }),
  biller({
    id: 'hmrc-self-assessment',
    name: 'HMRC Self Assessment',
    category: BillerCategory.OTHER,
    label: Label.CUSTOMER_REFERENCE,
    pattern: Pattern.ALPHANUMERIC_8_TO_14,
    max: '5000000',
  }),
]);
