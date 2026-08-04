/**
 * Real UK places for the branch and ATM finder.
 *
 * `faker.location.city()` draws from a US-weighted list, so the finder was rendering
 * "Reliance Upton Runte" next to a British postcode and a `+4420` phone number. Each
 * field was individually plausible and the row as a whole was nonsense — which is the
 * specific failure this package exists to avoid, since a fixture that contradicts itself
 * teaches the UI to tolerate incoherence.
 *
 * Street addresses are invented; the towns are not.
 */

export interface UkPlace {
  readonly city: string;
  readonly address: string;
}

export const UK_BRANCH_LOCATIONS: readonly UkPlace[] = Object.freeze([
  { city: 'London', address: '128 Cheapside' },
  { city: 'London', address: '44 Tottenham Court Road' },
  { city: 'London', address: '7 Brixton Hill' },
  { city: 'Manchester', address: '61 Deansgate' },
  { city: 'Manchester', address: '12 Oxford Road' },
  { city: 'Birmingham', address: '203 Corporation Street' },
  { city: 'Leeds', address: '18 Briggate' },
  { city: 'Glasgow', address: '95 Buchanan Street' },
  { city: 'Edinburgh', address: '31 Lothian Road' },
  { city: 'Bristol', address: '76 Park Street' },
  { city: 'Liverpool', address: '22 Bold Street' },
  { city: 'Newcastle upon Tyne', address: '54 Grainger Street' },
  { city: 'Sheffield', address: '9 Fargate' },
  { city: 'Nottingham', address: '40 Clumber Street' },
  { city: 'Cardiff', address: '15 Queen Street' },
  { city: 'Belfast', address: '88 Donegall Place' },
  { city: 'Brighton', address: '27 North Street' },
  { city: 'Cambridge', address: '3 Sidney Street' },
  { city: 'Oxford', address: '52 Cornmarket Street' },
  { city: 'Reading', address: '110 Broad Street' },
  { city: 'Southampton', address: '64 Above Bar Street' },
  { city: 'Leicester', address: '19 Gallowtree Gate' },
  { city: 'Coventry', address: '8 Broadgate' },
  { city: 'Aberdeen', address: '33 Union Street' },
  { city: 'York', address: '5 Coney Street' },
  { city: 'Bath', address: '21 Milsom Street' },
]);

/**
 * Bylines for the insights feed.
 *
 * A fixed set rather than `faker.person.fullName()`, so the same author recurs across
 * articles the way a real editorial team does. Random names on every article make a
 * publication look like it has forty writers and no editor.
 */
export const BYLINES: readonly string[] = Object.freeze([
  'Hannah Okoye',
  'Daniel Whitmore',
  'Priya Nair',
  'Callum Fraser',
  'Rebecca Lindqvist',
]);
