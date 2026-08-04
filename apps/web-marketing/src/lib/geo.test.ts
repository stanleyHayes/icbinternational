// TypeScript 7 does not pick `@types/jest` up from the automatic `@types` scan under
// this workspace's pnpm layout, and `tsconfig.json` is shared configuration this app
// does not own. The reference is the narrowest fix and affects type checking only.
/// <reference types="jest" />

import { distanceMetres } from './geo';

/** Real coordinates, so the expected distances can be checked against a map. */
const LONDON = { latitude: 51.5074, longitude: -0.1278 };
const BRISTOL = { latitude: 51.4545, longitude: -2.5879 };
const EDINBURGH = { latitude: 55.9533, longitude: -3.1883 };

describe('distanceMetres', () => {
  it('is zero between a point and itself', () => {
    expect(distanceMetres(LONDON, LONDON)).toBe(0);
  });

  it('matches the known great-circle distance London to Bristol', () => {
    const KILOMETRE = 1000;
    const distance = distanceMetres(LONDON, BRISTOL) / KILOMETRE;
    expect(distance).toBeGreaterThan(170);
    expect(distance).toBeLessThan(175);
  });

  it('matches the known great-circle distance London to Edinburgh', () => {
    const KILOMETRE = 1000;
    const distance = distanceMetres(LONDON, EDINBURGH) / KILOMETRE;
    expect(distance).toBeGreaterThan(530);
    expect(distance).toBeLessThan(540);
  });

  it('is symmetric', () => {
    expect(distanceMetres(LONDON, EDINBURGH)).toBe(distanceMetres(EDINBURGH, LONDON));
  });

  it('returns whole metres', () => {
    expect(Number.isInteger(distanceMetres(LONDON, BRISTOL))).toBe(true);
  });
});
