/**
 * Facts about the bank that appear in more than one place.
 *
 * Kept in one module because a phone number that differs between the footer and the
 * contact page is the kind of detail a customer notices and a bank cannot afford.
 */

/** Canonical origin. Overridden per environment for correct absolute URLs in metadata. */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.reliancebank.example';

/** Where the authenticated customer app lives. The open-an-account funnel hands off here. */
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.reliancebank.example';

/** The bank, as it identifies itself. */
export const BANK = {
  legalName: 'Reliance Bank plc',
  shortName: 'Reliance Bank',
  tagline: 'Banking you can stand on.',
  description:
    'Current accounts, savings, cards, lending and business banking, with clear pricing and ' +
    'deposits protected up to £85,000.',
  foundedYear: 2016,
  registrationNumber: '09482173',
  registeredOffice: {
    street: '1 Foundry Square',
    locality: 'London',
    postalCode: 'EC2A 4RQ',
    country: 'GB',
    countryName: 'United Kingdom',
  },
  phone: '+44 20 7946 0100',
  phoneDisplay: '020 7946 0100',
  lostCardPhone: '+44 20 7946 0111',
  lostCardDisplay: '020 7946 0111',
  fraudPhone: '159',
  email: 'hello@reliancebank.example',
  pressEmail: 'press@reliancebank.example',
  complaintsEmail: 'complaints@reliancebank.example',
} as const;

/** Deposit protection, in the words the regulator expects. */
export const DEPOSIT_PROTECTION = {
  limitLabel: '£85,000',
  scheme: 'Financial Services Compensation Scheme',
  schemeShort: 'FSCS',
} as const;

/** The regulatory footer every page carries. */
export const REGULATORY_STATEMENT =
  `${BANK.legalName} is registered in England and Wales (company number ` +
  `${BANK.registrationNumber}), registered office ${BANK.registeredOffice.street}, ` +
  `${BANK.registeredOffice.locality} ${BANK.registeredOffice.postalCode}. Authorised by the ` +
  'Prudential Regulation Authority and regulated by the Financial Conduct Authority and the ' +
  'Prudential Regulation Authority. Eligible deposits are protected up to ' +
  `${DEPOSIT_PROTECTION.limitLabel} per person by the ${DEPOSIT_PROTECTION.scheme}.`;

/** Basis points in one percentage point — the unit every rate on the wire arrives in. */
export const BPS_PER_PERCENT = 100;

/** Months in a year, for term maths in the calculators. */
export const MONTHS_PER_YEAR = 12;
