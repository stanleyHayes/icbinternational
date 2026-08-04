/**
 * Branches and ATMs.
 *
 * Real addresses on real streets, so the locator's distances and ordering are meaningful
 * rather than clustered on a single invented point.
 *
 * Coordinates are integer microdegrees — millionths of a degree, about a tenth of a metre
 * — which is the form they are stored, indexed and compared in. Writing them as decimals
 * here and converting on install would put a float in the banking core to save a decimal
 * point in a data file.
 */

import { LocationKind } from '@reliance/contracts';

import { ContentKind } from '../cms.constants.js';

import { type CatalogueEntry } from './catalogue.types.js';

const WEEKDAY_HOURS = [
  { day: 'MON', opens: '09:00', closes: '17:00' },
  { day: 'TUE', opens: '09:00', closes: '17:00' },
  { day: 'WED', opens: '09:30', closes: '17:00' },
  { day: 'THU', opens: '09:00', closes: '17:00' },
  { day: 'FRI', opens: '09:00', closes: '17:00' },
  { day: 'SAT', opens: '09:00', closes: '13:00' },
  { day: 'SUN', opens: null, closes: null },
] as const;

const ALWAYS_OPEN = [
  { day: 'MON', opens: '00:00', closes: '23:59' },
  { day: 'TUE', opens: '00:00', closes: '23:59' },
  { day: 'WED', opens: '00:00', closes: '23:59' },
  { day: 'THU', opens: '00:00', closes: '23:59' },
  { day: 'FRI', opens: '00:00', closes: '23:59' },
  { day: 'SAT', opens: '00:00', closes: '23:59' },
  { day: 'SUN', opens: '00:00', closes: '23:59' },
] as const;

const BRANCH_SERVICES = [
  'Cash and cheque deposits',
  'Account opening',
  'Mortgage and loan appointments',
  'Bereavement and power of attorney support',
];

const ATM_SERVICES = ['Cash withdrawal', 'Balance enquiry'];

interface BranchSeed {
  readonly slug: string;
  readonly name: string;
  readonly addressLine: string;
  readonly city: string;
  readonly postalCode: string;
  readonly latitudeMicro: number;
  readonly longitudeMicro: number;
  readonly phone: string;
  readonly kind: LocationKind;
}

const BRANCHES: readonly BranchSeed[] = Object.freeze([
  {
    slug: 'london-cornhill',
    name: 'London Cornhill',
    addressLine: '1 Cornhill Yard',
    city: 'London',
    postalCode: 'EC3V 3ND',
    latitudeMicro: 51_513_200,
    longitudeMicro: -87_400,
    phone: '020 7946 4400',
    kind: LocationKind.BOTH,
  },
  {
    slug: 'london-kings-cross',
    name: "London King's Cross",
    addressLine: '14 Pancras Square',
    city: 'London',
    postalCode: 'N1C 4AG',
    latitudeMicro: 51_534_100,
    longitudeMicro: -125_100,
    phone: '020 7946 4408',
    kind: LocationKind.BOTH,
  },
  {
    slug: 'manchester-spinningfields',
    name: 'Manchester Spinningfields',
    addressLine: '3 Hardman Square',
    city: 'Manchester',
    postalCode: 'M3 3EB',
    latitudeMicro: 53_479_800,
    longitudeMicro: -2_252_100,
    phone: '0161 496 4400',
    kind: LocationKind.BOTH,
  },
  {
    slug: 'birmingham-colmore-row',
    name: 'Birmingham Colmore Row',
    addressLine: '55 Colmore Row',
    city: 'Birmingham',
    postalCode: 'B3 2AA',
    latitudeMicro: 52_481_200,
    longitudeMicro: -1_902_300,
    phone: '0121 496 4400',
    kind: LocationKind.BRANCH,
  },
  {
    slug: 'leeds-park-row',
    name: 'Leeds Park Row',
    addressLine: '26 Park Row',
    city: 'Leeds',
    postalCode: 'LS1 5HR',
    latitudeMicro: 53_798_100,
    longitudeMicro: -1_547_900,
    phone: '0113 496 4400',
    kind: LocationKind.BOTH,
  },
  {
    slug: 'edinburgh-george-street',
    name: 'Edinburgh George Street',
    addressLine: '112 George Street',
    city: 'Edinburgh',
    postalCode: 'EH2 4LH',
    latitudeMicro: 55_953_200,
    longitudeMicro: -3_201_400,
    phone: '0131 496 4400',
    kind: LocationKind.BOTH,
  },
  {
    slug: 'cardiff-st-marys',
    name: 'Cardiff St Mary Street',
    addressLine: '41 St Mary Street',
    city: 'Cardiff',
    postalCode: 'CF10 1AD',
    latitudeMicro: 51_478_200,
    longitudeMicro: -3_178_100,
    phone: '029 2196 4400',
    kind: LocationKind.BRANCH,
  },
  {
    slug: 'bristol-corn-street',
    name: 'Bristol Corn Street',
    addressLine: '22 Corn Street',
    city: 'Bristol',
    postalCode: 'BS1 1HQ',
    latitudeMicro: 51_454_100,
    longitudeMicro: -2_594_500,
    phone: '0117 496 4400',
    kind: LocationKind.BOTH,
  },
  {
    slug: 'glasgow-buchanan-street',
    name: 'Glasgow Buchanan Street',
    addressLine: '88 Buchanan Street',
    city: 'Glasgow',
    postalCode: 'G1 3BA',
    latitudeMicro: 55_860_900,
    longitudeMicro: -4_253_800,
    phone: '0141 496 4400',
    kind: LocationKind.BOTH,
  },
  {
    slug: 'belfast-donegall-place',
    name: 'Belfast Donegall Place',
    addressLine: '17 Donegall Place',
    city: 'Belfast',
    postalCode: 'BT1 5AB',
    latitudeMicro: 54_599_100,
    longitudeMicro: -5_930_800,
    phone: '028 9596 4400',
    kind: LocationKind.BRANCH,
  },
  {
    slug: 'london-canary-wharf-atm',
    name: 'Canary Wharf — Jubilee Place',
    addressLine: '45 Bank Street',
    city: 'London',
    postalCode: 'E14 5NY',
    latitudeMicro: 51_503_400,
    longitudeMicro: -19_300,
    phone: '',
    kind: LocationKind.ATM,
  },
  {
    slug: 'manchester-piccadilly-atm',
    name: 'Manchester Piccadilly Station',
    addressLine: 'Piccadilly Station Approach',
    city: 'Manchester',
    postalCode: 'M1 2PB',
    latitudeMicro: 53_477_300,
    longitudeMicro: -2_230_900,
    phone: '',
    kind: LocationKind.ATM,
  },
]);

export const DIRECTORY_CATALOGUE: readonly CatalogueEntry[] = Object.freeze(
  BRANCHES.map((branch, index) => toEntry(branch, index)),
);

function toEntry(branch: BranchSeed, index: number): CatalogueEntry {
  const isAtm = branch.kind === LocationKind.ATM;

  return {
    kind: ContentKind.LOCATION,
    slug: branch.slug,
    title: branch.name,
    order: index,
    latitudeMicro: branch.latitudeMicro,
    longitudeMicro: branch.longitudeMicro,
    tags: [branch.city.toLowerCase()],
    payload: {
      kind: branch.kind,
      addressLine: branch.addressLine,
      city: branch.city,
      postalCode: branch.postalCode,
      country: 'GB',
      phone: branch.phone,
      services: isAtm ? ATM_SERVICES : BRANCH_SERVICES,
      openingHours: isAtm ? ALWAYS_OPEN : WEEKDAY_HOURS,
      wheelchairAccessible: true,
      hasDepositMachine: branch.kind !== LocationKind.BRANCH,
    },
  };
}
