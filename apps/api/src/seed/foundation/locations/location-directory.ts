import { LocationKind, type BankLocation } from '@reliance/contracts';

import { SEED_COUNTRY } from '../../seed.constants.js';

import {
  ATM_SERVICES,
  BRANCH_SERVICES,
  City,
  degrees,
  EXTENDED,
  HIGH_STREET,
  ROUND_THE_CLOCK,
} from './location-builders.js';

/**
 * Reliance Bank's branches and cash machines.
 *
 * Coordinates are the real positions of the streets named, so the "find us" map plots
 * points that sit on roads rather than in the sea, and a proximity search from a real
 * postcode returns a plausible ordering. Telephone numbers come from Ofcom's ranges
 * reserved for drama, which can never connect to a real subscriber.
 */

interface LocationRow {
  id: string;
  kind: LocationKind;
  name: string;
  address: string;
  city: string;
  postcode: string;
  /** Latitude in microdegrees — see {@link degrees}. */
  lat: number;
  /** Longitude in microdegrees. */
  lng: number;
  phone?: string;
  hours: BankLocation['openingHours'];
  services?: readonly string[];
  deposit?: boolean;
  accessible?: boolean;
}

function location(row: LocationRow): BankLocation {
  const isBranch = row.kind !== LocationKind.ATM;

  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    addressLine: row.address,
    city: row.city,
    postalCode: row.postcode,
    country: SEED_COUNTRY,
    latitude: degrees(row.lat),
    longitude: degrees(row.lng),
    phone: row.phone ?? null,
    services: [...(row.services ?? (isBranch ? BRANCH_SERVICES : ATM_SERVICES))],
    openingHours: row.hours,
    wheelchairAccessible: row.accessible ?? true,
    hasDepositMachine: row.deposit ?? isBranch,
    distanceMetres: null,
  };
}

/** Every branch and cash machine, ordered by city. */
export const LOCATION_DIRECTORY: readonly BankLocation[] = Object.freeze([
  location({
    id: 'ldn-cheapside',
    kind: LocationKind.BOTH,
    name: 'London Cheapside',
    address: '112 Cheapside',
    city: City.LONDON,
    postcode: 'EC2V 6DN',
    lat: 51_513_800,
    lng: -94_700,
    phone: '+442079460101',
    hours: EXTENDED,
  }),
  location({
    id: 'ldn-canary-wharf',
    kind: LocationKind.BOTH,
    name: 'Canary Wharf',
    address: '20 Cabot Square',
    city: City.LONDON,
    postcode: 'E14 4QW',
    lat: 51_505_400,
    lng: -20_400,
    phone: '+442079460102',
    hours: EXTENDED,
  }),
  location({
    id: 'ldn-oxford-street',
    kind: LocationKind.BOTH,
    name: 'Oxford Street',
    address: '318 Oxford Street',
    city: City.LONDON,
    postcode: 'W1C 1HF',
    lat: 51_515_600,
    lng: -148_600,
    phone: '+442079460103',
    hours: EXTENDED,
  }),
  location({
    id: 'ldn-brixton',
    kind: LocationKind.BRANCH,
    name: 'Brixton',
    address: '423 Brixton Road',
    city: City.LONDON,
    postcode: 'SW9 8HF',
    lat: 51_462_400,
    lng: -114_600,
    phone: '+442079460104',
    hours: HIGH_STREET,
  }),
  location({
    id: 'ldn-kings-cross-atm',
    kind: LocationKind.ATM,
    name: "King's Cross Station",
    address: 'Euston Road',
    city: City.LONDON,
    postcode: 'N1 9AL',
    lat: 51_530_900,
    lng: -123_200,
    hours: ROUND_THE_CLOCK,
  }),
  location({
    id: 'ldn-stratford-atm',
    kind: LocationKind.ATM,
    name: 'Stratford Westfield',
    address: 'Montfichet Road',
    city: City.LONDON,
    postcode: 'E20 1EJ',
    lat: 51_543_500,
    lng: -8_300,
    hours: ROUND_THE_CLOCK,
    deposit: true,
  }),

  location({
    id: 'man-king-street',
    kind: LocationKind.BOTH,
    name: 'Manchester King Street',
    address: '35 King Street',
    city: City.MANCHESTER,
    postcode: 'M2 7AT',
    lat: 53_480_900,
    lng: -2_243_500,
    phone: '+441632960201',
    hours: EXTENDED,
  }),
  location({
    id: 'man-piccadilly-atm',
    kind: LocationKind.ATM,
    name: 'Manchester Piccadilly',
    address: 'Station Approach',
    city: City.MANCHESTER,
    postcode: 'M1 2PB',
    lat: 53_477_400,
    lng: -2_230_900,
    hours: ROUND_THE_CLOCK,
  }),

  location({
    id: 'bhm-new-street',
    kind: LocationKind.BOTH,
    name: 'Birmingham New Street',
    address: '124 New Street',
    city: City.BIRMINGHAM,
    postcode: 'B2 4HQ',
    lat: 52_478_600,
    lng: -1_898_500,
    phone: '+441632960301',
    hours: EXTENDED,
  }),
  location({
    id: 'bhm-bullring-atm',
    kind: LocationKind.ATM,
    name: 'Bullring',
    address: 'St Martins Walk',
    city: City.BIRMINGHAM,
    postcode: 'B5 4BU',
    lat: 52_477_600,
    lng: -1_893_800,
    hours: ROUND_THE_CLOCK,
  }),

  location({
    id: 'lds-briggate',
    kind: LocationKind.BRANCH,
    name: 'Leeds Briggate',
    address: '78 Briggate',
    city: 'Leeds',
    postcode: 'LS1 6LQ',
    lat: 53_798_300,
    lng: -1_542_100,
    phone: '+441632960401',
    hours: HIGH_STREET,
  }),
  location({
    id: 'shf-fargate',
    kind: LocationKind.BRANCH,
    name: 'Sheffield Fargate',
    address: '41 Fargate',
    city: 'Sheffield',
    postcode: 'S1 2HD',
    lat: 53_381_400,
    lng: -1_470_600,
    phone: '+441632960402',
    hours: HIGH_STREET,
  }),
  location({
    id: 'ntm-old-market',
    kind: LocationKind.BRANCH,
    name: 'Nottingham Old Market Square',
    address: '12 South Parade',
    city: 'Nottingham',
    postcode: 'NG1 2JS',
    lat: 52_953_400,
    lng: -1_150_100,
    phone: '+441632960403',
    hours: HIGH_STREET,
  }),
  location({
    id: 'lei-gallowtree-atm',
    kind: LocationKind.ATM,
    name: 'Leicester Gallowtree Gate',
    address: '30 Gallowtree Gate',
    city: 'Leicester',
    postcode: 'LE1 5AD',
    lat: 52_635_300,
    lng: -1_132_400,
    hours: ROUND_THE_CLOCK,
    accessible: false,
  }),

  location({
    id: 'lvp-lord-street',
    kind: LocationKind.BOTH,
    name: 'Liverpool Lord Street',
    address: '52 Lord Street',
    city: 'Liverpool',
    postcode: 'L2 1TL',
    lat: 53_405_300,
    lng: -2_986_500,
    phone: '+441632960501',
    hours: HIGH_STREET,
  }),
  location({
    id: 'ncl-grey-street',
    kind: LocationKind.BRANCH,
    name: 'Newcastle Grey Street',
    address: '61 Grey Street',
    city: 'Newcastle upon Tyne',
    postcode: 'NE1 6EF',
    lat: 54_972_300,
    lng: -1_611_400,
    phone: '+441632960502',
    hours: HIGH_STREET,
  }),

  location({
    id: 'gla-buchanan',
    kind: LocationKind.BOTH,
    name: 'Glasgow Buchanan Street',
    address: '145 Buchanan Street',
    city: 'Glasgow',
    postcode: 'G1 2JX',
    lat: 55_862_100,
    lng: -4_254_700,
    phone: '+441632960601',
    hours: EXTENDED,
  }),
  location({
    id: 'edi-princes-street',
    kind: LocationKind.BOTH,
    name: 'Edinburgh Princes Street',
    address: '104 Princes Street',
    city: 'Edinburgh',
    postcode: 'EH2 3AA',
    lat: 55_951_500,
    lng: -3_200_800,
    phone: '+441632960602',
    hours: EXTENDED,
  }),

  location({
    id: 'cdf-queen-street',
    kind: LocationKind.BRANCH,
    name: 'Cardiff Queen Street',
    address: '88 Queen Street',
    city: 'Cardiff',
    postcode: 'CF10 2GR',
    lat: 51_481_700,
    lng: -3_172_600,
    phone: '+441632960701',
    hours: HIGH_STREET,
  }),
  location({
    id: 'bel-donegall-atm',
    kind: LocationKind.ATM,
    name: 'Belfast Donegall Place',
    address: '22 Donegall Place',
    city: 'Belfast',
    postcode: 'BT1 5BA',
    lat: 54_598_600,
    lng: -5_930_100,
    hours: ROUND_THE_CLOCK,
  }),

  location({
    id: 'bri-corn-street',
    kind: LocationKind.BRANCH,
    name: 'Bristol Corn Street',
    address: '31 Corn Street',
    city: 'Bristol',
    postcode: 'BS1 1HT',
    lat: 51_454_500,
    lng: -2_594_200,
    phone: '+441632960801',
    hours: HIGH_STREET,
  }),
  location({
    id: 'brn-north-street-atm',
    kind: LocationKind.ATM,
    name: 'Brighton North Street',
    address: '141 North Street',
    city: 'Brighton',
    postcode: 'BN1 1EA',
    lat: 50_822_600,
    lng: -142_800,
    hours: ROUND_THE_CLOCK,
  }),
  location({
    id: 'cam-market-hill',
    kind: LocationKind.BRANCH,
    name: 'Cambridge Market Hill',
    address: '9 Market Hill',
    city: 'Cambridge',
    postcode: 'CB2 3NB',
    lat: 52_205_500,
    lng: 119_500,
    phone: '+441632960802',
    hours: HIGH_STREET,
  }),
  location({
    id: 'oxf-cornmarket-atm',
    kind: LocationKind.ATM,
    name: 'Oxford Cornmarket',
    address: '18 Cornmarket Street',
    city: 'Oxford',
    postcode: 'OX1 3EX',
    lat: 51_753_400,
    lng: -1_258_300,
    hours: ROUND_THE_CLOCK,
  }),
  location({
    id: 'rdg-broad-street',
    kind: LocationKind.BRANCH,
    name: 'Reading Broad Street',
    address: '76 Broad Street',
    city: 'Reading',
    postcode: 'RG1 2AP',
    lat: 51_455_200,
    lng: -974_400,
    phone: '+441632960803',
    hours: HIGH_STREET,
  }),
  location({
    id: 'sou-above-bar-atm',
    kind: LocationKind.ATM,
    name: 'Southampton Above Bar',
    address: '133 Above Bar Street',
    city: 'Southampton',
    postcode: 'SO14 7DU',
    lat: 50_906_400,
    lng: -1_404_300,
    hours: ROUND_THE_CLOCK,
  }),
]);
